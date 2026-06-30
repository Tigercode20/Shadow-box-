import React from 'react';

interface SliderControlProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  suffix?: string;
  onChange: (val: number) => void;
}

export const SliderControl: React.FC<SliderControlProps> = ({
  label,
  min,
  max,
  step = 1,
  value,
  suffix = '',
  onChange,
}) => {
  const handleDecrement = () => {
    onChange(Math.max(min, value - step * 5)); // Dec by 5 steps
  };

  const handleIncrement = () => {
    onChange(Math.min(max, value + step * 5)); // Inc by 5 steps
  };

  return (
    <div className="input-group">
      <label>{label}</label>
      <div className="slider-control">
        <button className="step-btn" onClick={handleDecrement}>-</button>
        <div className="slider-wrapper">
          <input 
            type="range" 
            min={min} 
            max={max} 
            step={step} 
            value={value} 
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
          <span className="slider-val">{value}{suffix}</span>
        </div>
        <button className="step-btn" onClick={handleIncrement}>+</button>
      </div>
    </div>
  );
};
