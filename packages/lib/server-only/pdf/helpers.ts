import path from 'node:path';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { FontLibrary } from '@documenso/skia-canvas';
import type { Recipient } from '@prisma/client';
import { FieldType } from '@prisma/client';
import type Konva from 'konva';
import { match } from 'ts-pattern';

import { isRtlLanguage } from '../../constants/locales';

/**
 * Ensure all required fonts are registered in the skia-canvas FontLibrary.
 *
 * Fonts are registered once per process and retained — calling this multiple
 * times is a no-op after the first invocation.
 */
export const ensureFontLibrary = () => {
  const fontPath = path.join(process.cwd(), 'public/fonts');

  if (!FontLibrary.has('Caveat')) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    FontLibrary.use({
      ['Caveat']: [path.join(fontPath, 'caveat.ttf')],
    });
  }

  if (!FontLibrary.has('Inter')) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    FontLibrary.use({
      ['Inter']: [path.join(fontPath, 'inter-variablefont_opsz,wght.ttf')],
    });
  }

  if (!FontLibrary.has('Noto Sans')) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    FontLibrary.use({
      ['Noto Sans']: [path.join(fontPath, 'noto-sans.ttf')],
      ['Noto Sans Japanese']: [path.join(fontPath, 'noto-sans-japanese.ttf')],
      ['Noto Sans Chinese']: [path.join(fontPath, 'noto-sans-chinese.ttf')],
      ['Noto Sans Korean']: [path.join(fontPath, 'noto-sans-korean.ttf')],
      ['Noto Sans Hebrew']: [
        path.join(fontPath, 'noto-sans-hebrew.ttf'),
        path.join(fontPath, 'noto-sans-hebrew-bold.ttf'),
      ],
    });
  }
};

type RecipientPlaceholderInfo = {
  email: string;
  name: string;
  recipientIndex: number;
};

/*
  Parse field type string to FieldType enum.
  Normalizes the input (uppercase, trim) and validates it's a valid field type.
  This ensures we handle case variations and whitespace, and provides clear error messages.
*/
export const parseFieldTypeFromPlaceholder = (fieldTypeString: string): FieldType => {
  const normalizedType = fieldTypeString.toUpperCase().trim();

  return match(normalizedType)
    .with('SIGNATURE', () => FieldType.SIGNATURE)
    .with('FREE_SIGNATURE', () => FieldType.FREE_SIGNATURE)
    .with('INITIALS', () => FieldType.INITIALS)
    .with('NAME', () => FieldType.NAME)
    .with('EMAIL', () => FieldType.EMAIL)
    .with('DATE', () => FieldType.DATE)
    .with('TEXT', () => FieldType.TEXT)
    .with('NUMBER', () => FieldType.NUMBER)
    .with('RADIO', () => FieldType.RADIO)
    .with('CHECKBOX', () => FieldType.CHECKBOX)
    .with('DROPDOWN', () => FieldType.DROPDOWN)
    .otherwise(() => {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message: `Invalid field type: ${fieldTypeString}`,
      });
    });
};

/*
  Transform raw field metadata from placeholder format to schema format.
  Users should provide properly capitalized property names (e.g., readOnly, fontSize, textAlign).
  Converts string values to proper types (booleans, numbers).
*/
export const parseFieldMetaFromPlaceholder = (
  rawFieldMeta: Record<string, string>,
  fieldType: FieldType,
): Record<string, unknown> | undefined => {
  if (fieldType === FieldType.SIGNATURE || fieldType === FieldType.FREE_SIGNATURE) {
    return;
  }

  if (Object.keys(rawFieldMeta).length === 0) {
    return;
  }

  const fieldTypeString = String(fieldType).toLowerCase();

  const parsedFieldMeta: Record<string, boolean | number | string> = {
    type: fieldTypeString,
  };

  /*
    rawFieldMeta is an object with string keys and string values.
    It contains string values because the PDF parser returns the values as strings.

    E.g. { 'required': 'true', 'fontSize': '12', 'maxValue': '100', 'minValue': '0', 'characterLimit': '100' }
  */
  const rawFieldMetaEntries = Object.entries(rawFieldMeta);

  for (const [property, value] of rawFieldMetaEntries) {
    if (property === 'readOnly' || property === 'required') {
      parsedFieldMeta[property] = value === 'true';
    } else if (
      property === 'fontSize' ||
      property === 'maxValue' ||
      property === 'minValue' ||
      property === 'characterLimit'
    ) {
      const numValue = Number(value);

      if (!Number.isNaN(numValue)) {
        parsedFieldMeta[property] = numValue;
      }
    } else {
      parsedFieldMeta[property] = value;
    }
  }

  return parsedFieldMeta;
};

const extractRecipientPlaceholder = (placeholder: string): RecipientPlaceholderInfo => {
  const indexMatch = placeholder.match(/^r(\d+)$/i);

  if (!indexMatch) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: `Invalid recipient placeholder format: ${placeholder}. Expected format: r1, r2, r3, etc.`,
    });
  }

  const recipientIndex = Number(indexMatch[1]);

  return {
    email: `recipient.${recipientIndex}@documenso.com`,
    name: `Recipient ${recipientIndex}`,
    recipientIndex,
  };
};

/*
  Finds a recipient based on a placeholder reference.
  If recipients array is provided, uses index-based matching (r1 -> recipients[0], etc.).
  Otherwise, uses email-based matching from createdRecipients.
*/
export const findRecipientByPlaceholder = (
  recipientPlaceholder: string,
  placeholder: string,
  recipients: Pick<Recipient, 'id' | 'email'>[] | undefined,
  createdRecipients: Pick<Recipient, 'id' | 'email'>[],
): Pick<Recipient, 'id' | 'email'> => {
  if (recipients && recipients.length > 0) {
    /*
      Map placeholder by index: r1 -> recipients[0], r2 -> recipients[1], etc.
      recipientIndex is 1-based, so we subtract 1 to get the array index.
    */
    const { recipientIndex } = extractRecipientPlaceholder(recipientPlaceholder);
    const recipientArrayIndex = recipientIndex - 1;

    if (recipientArrayIndex < 0 || recipientArrayIndex >= recipients.length) {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message: `Recipient placeholder ${recipientPlaceholder} (index ${recipientIndex}) is out of range. Provided ${recipients.length} recipient(s).`,
      });
    }

    return recipients[recipientArrayIndex];
  }

  /*
    Use email-based matching for placeholder recipients.
  */
  const { email } = extractRecipientPlaceholder(recipientPlaceholder);
  const recipient = createdRecipients.find((r) => r.email === email);

  if (!recipient) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: `Could not find recipient ID for placeholder: ${placeholder}`,
    });
  }

  return recipient;
};

/**
 * Font for text the app draws onto PDFs (certificate, audit log). Inter has no Hebrew letters, and
 * the production container has no system fonts to fall back on, so Hebrew is named explicitly.
 */
export const PDF_TEXT_FONT_FAMILY = 'Inter, "Noto Sans Hebrew"';

/**
 * Mirrors a laid-out page horizontally: every visible node (text, shape, image) moves to the
 * opposite side of the page, keeping its size, so columns and label/value pairs read right to
 * left. Groups are left in place, so all positions are measured once against the same page.
 * Images and shapes are moved, never flipped.
 */
const mirrorHorizontally = (page: Konva.Container, pageWidth: number) => {
  const leaves = page.find((node: Konva.Node) => typeof (node as Konva.Container).getChildren !== 'function');

  const moves = leaves.map((node) => {
    const box = node.getClientRect({ relativeTo: page, skipShadow: true, skipStroke: true });

    return { node, delta: pageWidth - box.x - box.width - box.x };
  });

  for (const { node, delta } of moves) {
    node.x(node.x() + delta);

    if (node.getClassName() === 'Text') {
      const text = node as Konva.Text;

      // Text without Hebrew letters (dates, emails, IDs) keeps its own reading order; right-to-left
      // reordering would scramble "2026-10-26 03:36 PM (GMT+2)".
      text.direction(/[\u0590-\u05FF]/.test(text.text()) ? 'rtl' : 'ltr');

      if (text.getAttr('width') !== undefined && text.align() !== 'center') {
        text.align('right');
      }
    }
  }
};

/**
 * For right-to-left languages, lays a rendered page out right to left (see `mirrorHorizontally`).
 */
export const applyTextDirection = (page: Konva.Container, language: string, pageWidth: number) => {
  if (!isRtlLanguage(language)) {
    return;
  }

  mirrorHorizontally(page, pageWidth);
};
