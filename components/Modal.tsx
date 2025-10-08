
import React, { ReactNode } from 'react';
import { CloseIcon } from './icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white/5 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg m-4 p-6 text-white animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

export default Modal;