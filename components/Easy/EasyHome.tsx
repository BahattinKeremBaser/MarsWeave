/**
 * MARSWEAVE — EASY mode home page. Plain words, one big button.
 */
import React from 'react';

interface EasyHomeProps {
  onStart: () => void;
}

export const EasyHome: React.FC<EasyHomeProps> = ({ onStart }) => (
  <main className="flex-1 overflow-auto flex items-center justify-center px-5 py-10 bg-[#07090e]" data-testid="easy-home">
    <div className="max-w-xl text-center space-y-6 font-sans">
      <div className="text-6xl" aria-hidden>🪐</div>
      <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">Walk on Mars!</h1>
      <p className="text-lg text-[#cdd3de] leading-relaxed">
        Mars is a red planet far away. One day, people will walk there.
        This game helps them find a <b className="text-white">safe path</b>.
      </p>
      <ul className="text-left text-base text-[#cdd3de] space-y-3 bg-[#10141d] border border-[#1c2230] rounded-xl p-5">
        <li>1️⃣ Pick a place to visit.</li>
        <li>2️⃣ See the path the computer found.</li>
        <li>3️⃣ Press the button and watch the astronaut walk!</li>
      </ul>
      <button
        onClick={onStart}
        data-testid="easy-start"
        className="px-8 py-4 bg-[#c85a32] hover:bg-[#e06a3e] text-white text-xl font-bold rounded-xl shadow-lg transition cursor-pointer"
      >
        Let's go! →
      </button>
      <p className="text-xs text-[#8b95a5]">
        Want the science details? Switch to ADVANCED at the top.
      </p>
    </div>
  </main>
);
