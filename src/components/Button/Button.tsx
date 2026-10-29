import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { motion } from 'framer-motion';
import { lift, press, spring } from '../../lib/motion';
import './Button.css';

type Variant = 'primary' | 'gold' | 'secondary' | 'quiet';
type Size = 'md' | 'lg' | 'sm';

type CommonProps = {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  children?: ReactNode;
};

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
    loading?: boolean;
  };

/** The only button in the app. One `primary` (or `gold`) per screen. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, icon, iconEnd, loading, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      className="btn"
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileHover={disabled || loading || variant === 'quiet' ? undefined : lift}
      whileTap={disabled || loading ? undefined : press}
      transition={spring}
      {...rest}
    >
      {/* Loading = a light sweep across the button, label stays readable (no spinner). */}
      {loading && <span className="btn__shimmer" aria-hidden="true" />}
      {icon}
      {children && <span className="btn__label">{children}</span>}
      {iconEnd}
    </motion.button>
  );
});

const MotionLink = motion.create(Link);

export type ButtonLinkProps = CommonProps & Omit<LinkProps, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'>;

/** Router link styled as a button (for navigation-only actions). */
export function ButtonLink({ variant = 'primary', size = 'md', block, icon, iconEnd, children, ...rest }: ButtonLinkProps) {
  return (
    <MotionLink
      className="btn"
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
      whileHover={variant === 'quiet' ? undefined : lift}
      whileTap={press}
      transition={spring}
      {...rest}
    >
      {icon}
      {children && <span className="btn__label">{children}</span>}
      {iconEnd}
    </MotionLink>
  );
}
