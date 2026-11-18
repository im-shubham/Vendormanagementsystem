import clsx from 'clsx';
import logo from '@/assets/rcpl-logo.png';

/** Official RCPL logo (symbol + wordmark) — always on a clean white background. */
export function Logo({ className, alt = 'Reliance Consumer Products Limited' }: { className?: string; alt?: string }) {
  return <img src={logo} alt={alt} className={clsx('h-auto select-none object-contain', className)} draggable={false} />;
}
