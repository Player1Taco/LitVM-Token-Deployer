import React from 'react';

interface TacoConfig {
  id: number;
  emoji: string;
  size: number;
  left: string;
  top: string;
  animClass: string;
  opacity: number;
  delay: string;
}

const tacos: TacoConfig[] = [
  { id: 1, emoji: '🌮', size: 32, left: '5%', top: '15%', animClass: 'taco-1', opacity: 0.7, delay: '0s' },
  { id: 2, emoji: '🌮', size: 24, left: '85%', top: '10%', animClass: 'taco-2', opacity: 0.5, delay: '1s' },
  { id: 3, emoji: '🌮', size: 40, left: '70%', top: '60%', animClass: 'taco-3', opacity: 0.6, delay: '2s' },
  { id: 4, emoji: '🌮', size: 20, left: '15%', top: '70%', animClass: 'taco-4', opacity: 0.4, delay: '0.5s' },
  { id: 5, emoji: '🌮', size: 36, left: '90%', top: '40%', animClass: 'taco-5', opacity: 0.55, delay: '3s' },
  { id: 6, emoji: '🌮', size: 28, left: '50%', top: '85%', animClass: 'taco-1', opacity: 0.45, delay: '1.5s' },
  { id: 7, emoji: '🌮', size: 22, left: '30%', top: '30%', animClass: 'taco-2', opacity: 0.35, delay: '4s' },
  { id: 8, emoji: '🌮', size: 44, left: '3%', top: '50%', animClass: 'taco-3', opacity: 0.5, delay: '2.5s' },
  { id: 9, emoji: '🌮', size: 18, left: '60%', top: '20%', animClass: 'taco-4', opacity: 0.4, delay: '3.5s' },
  { id: 10, emoji: '🌮', size: 30, left: '40%', top: '55%', animClass: 'taco-5', opacity: 0.3, delay: '0.8s' },
  { id: 11, emoji: '🌮', size: 26, left: '75%', top: '80%', animClass: 'taco-spin', opacity: 0.45, delay: '1.2s' },
  { id: 12, emoji: '🌮', size: 34, left: '20%', top: '90%', animClass: 'taco-1', opacity: 0.35, delay: '2.8s' },
  { id: 13, emoji: '🌮', size: 16, left: '95%', top: '25%', animClass: 'taco-5', opacity: 0.3, delay: '4.5s' },
  { id: 14, emoji: '🌮', size: 38, left: '55%', top: '5%', animClass: 'taco-spin', opacity: 0.4, delay: '1.8s' },
  { id: 15, emoji: '🌮', size: 20, left: '8%', top: '35%', animClass: 'taco-3', opacity: 0.35, delay: '3.2s' },
];

const FloatingTacos: React.FC = () => {
  return (
    <>
      {tacos.map((taco) => (
        <div
          key={taco.id}
          className={`taco-float ${taco.animClass}`}
          style={{
            left: taco.left,
            top: taco.top,
            fontSize: `${taco.size}px`,
            opacity: taco.opacity,
            animationDelay: taco.delay,
          }}
          aria-hidden="true"
        >
          {taco.emoji}
        </div>
      ))}
    </>
  );
};

export default FloatingTacos;
