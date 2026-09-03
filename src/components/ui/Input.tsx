import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div>
        {label && <label htmlFor={inputId} className="label">{label}</label>}
        <input ref={ref} id={inputId} className={`input ${error ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20' : ''} ${className}`} {...props} />
        {hint && !error && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        {error && <p className="mt-1 text-xs text-danger-400">{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div>
        {label && <label htmlFor={inputId} className="label">{label}</label>}
        <textarea ref={ref} id={inputId} className={`input min-h-[100px] resize-y ${className}`} {...props} />
        {hint && !error && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        {error && <p className="mt-1 text-xs text-danger-400">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', id, children, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div>
        {label && <label htmlFor={inputId} className="label">{label}</label>}
        <select ref={ref} id={inputId} className={`input cursor-pointer ${className}`} {...props}>
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-danger-400">{error}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';
