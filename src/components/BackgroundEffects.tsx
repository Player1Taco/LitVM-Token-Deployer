import React from 'react';
import FloatingTacos from './FloatingTacos';

const BackgroundEffects: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-grid opacity-50" />

      {/* Primary orb */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full animate-float"
        style={{
          top: '-10%',
          right: '-5%',
          background: 'radial-gradient(circle, rgba(158,127,255,0.12) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Secondary orb */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full animate-float-delayed"
        style={{
          bottom: '5%',
          left: '-10%',
          background: 'radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Accent orb */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full animate-float-slow"
        style={{
          top: '40%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(244,114,182,0.06) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }}
      />

      {/* Floating particles */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="particle animate-float"
          style={{
            width: `${2 + Math.random() * 4}px`,
            height: `${2 + Math.random() * 4}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background:
              i % 3 === 0
                ? 'rgba(158,127,255,0.4)'
                : i % 3 === 1
                ? 'rgba(56,189,248,0.3)'
                : 'rgba(244,114,182,0.3)',
            animationDelay: `${Math.random() * 6}s`,
            animationDuration: `${4 + Math.random() * 6}s`,
          }}
        />
      ))}

      {/* 🌮 Floating Tacos */}
      <FloatingTacos />

      {/* Circuit lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="circuit" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 0 100 L 80 100 L 100 80 L 100 0" fill="none" stroke="#9E7FFF" strokeWidth="1" />
            <path d="M 200 100 L 120 100 L 100 120 L 100 200" fill="none" stroke="#38bdf8" strokeWidth="1" />
            <circle cx="100" cy="100" r="3" fill="#9E7FFF" />
            <circle cx="80" cy="100" r="2" fill="#38bdf8" />
            <circle cx="100" cy="80" r="2" fill="#f472b6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#circuit)" />
      </svg>
    </div>
  );
};

export default BackgroundEffects;
