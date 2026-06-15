'use client';

import { motion } from 'framer-motion';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';

export default function DimensionsStep() {
  const {
    height, setHeight,
    width, setWidth,
    length, setLength,
    wallsVisible, setWallsVisible,
    getFloorArea, getNumberOfBays,
    nextStep,
  } = useConfiguratorStore();

  const floorArea = getFloorArea();
  const numberOfBays = getNumberOfBays();

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: number) => void, min: number, max: number) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    val = Math.max(min, Math.min(max, val));
    setter(val);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-black uppercase mb-1">Dimensiuni</h3>
      </div>

      {/* Sliders */}
      <div className="space-y-5 flex-1">
        {/* Height */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-bold text-gray-800">Lungime</label>
            <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1">
              <input
                type="number"
                value={length}
                min={12}
                max={102}
                step={6}
                className="w-10 text-right outline-none text-black font-medium"
                onChange={(e) => handleInput(e, setLength, 12, 102)}
              />
              <span className="text-gray-500 ml-1">m</span>
            </div>
          </div>
          <input
            type="range"
            min={12}
            max={102}
            step={6}
            value={length}
            className="w-full cursor-pointer"
            style={{ '--range-progress': `${((length - 12) / 90) * 100}%` } as React.CSSProperties}
            onChange={(e) => setLength(parseInt(e.target.value, 10))}
          />
        </div>

        {/* Width */}
        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-bold text-gray-800">Lățime</label>
            <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1">
              <input
                type="number"
                value={width}
                min={8}
                max={20}
                className="w-10 text-right outline-none text-black font-medium"
                onChange={(e) => handleInput(e, setWidth, 8, 20)}
              />
              <span className="text-gray-500 ml-1">m</span>
            </div>
          </div>
          <input
            type="range"
            min={8}
            max={20}
            step={1}
            value={width}
            className="w-full cursor-pointer"
            style={{ '--range-progress': `${((width - 8) / 12) * 100}%` } as React.CSSProperties}
            onChange={(e) => setWidth(parseInt(e.target.value, 10))}
          />
        </div>

        {/* Height */}
        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-bold text-gray-800">Înălțime</label>
            <div className="flex items-center border border-gray-300 rounded-lg px-3 py-1">
              <input
                type="number"
                value={height}
                min={3}
                max={6}
                className="w-10 text-right outline-none text-black font-medium"
                onChange={(e) => handleInput(e, setHeight, 3, 6)}
              />
              <span className="text-gray-500 ml-1">m</span>
            </div>
          </div>
          <input
            type="range"
            min={3}
            max={6}
            step={1}
            value={height}
            className="w-full cursor-pointer"
            style={{ '--range-progress': `${((height - 3) / 3) * 100}%` } as React.CSSProperties}
            onChange={(e) => setHeight(parseInt(e.target.value, 10))}
          />
        </div>
        {/* Computed values */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-100 mb-6">
          <span className="text-sm font-bold text-gray-800">Suprafață utilă</span>
          <span className="text-sm font-bold text-black">{floorArea} m²</span>
        </div>

        {/* Remove walls toggle */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div>
            <span className="text-sm font-bold text-gray-800 block">
              Ascunde pereții
            </span>
            <span className="text-xs text-gray-500">
              Afișează cotele dimensionale
            </span>
          </div>
          <button
            onClick={() => setWallsVisible(!wallsVisible)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 cursor-pointer ${
              !wallsVisible ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                !wallsVisible ? 'translate-x-6' : 'translate-x-1'
              } shadow-sm`}
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
