import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

export const BrandingLogoIcon = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Pactira" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M14 6a6 6 0 0 0-6 6v40a6 6 0 0 0 6 6h29.4a14 14 0 1 0 0-28H38V12L32 6H14Zm20 3.5V15h5.5L34 9.5ZM16 18a3 3 0 0 1 3-3h9a3 3 0 1 1 0 6h-9a3 3 0 0 1-3-3Zm0 12a3 3 0 0 1 3-3h12a3 3 0 1 1 0 6H19a3 3 0 0 1-3-3Zm31 4a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm5.7 5.8-7.2 7.3-3.8-3.5a2.4 2.4 0 1 0-3.2 3.6l5.5 5a2.4 2.4 0 0 0 3.3-.1l8.7-8.8a2.4 2.4 0 1 0-3.3-3.4Z"
      />
    </svg>
  );
};
