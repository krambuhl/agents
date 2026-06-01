// THROWAWAY fixture for the guild-validate workflow demo.
// Planted issues so a real multi-evaluator panel has something to find:
//   - <img> with no alt text            -> a11y
//   - inline literal color style          -> tokens
//   - raw <a href> instead of next/link   -> nextjs
import styles from './Widget.module.css';

export function Widget({ href, imageSrc }: { href: string; imageSrc: string }) {
  return (
    <div className={styles.card} style={{ color: '#3366ff' }}>
      <img src={imageSrc} />
      <a href={href}>Learn more</a>
    </div>
  );
}
