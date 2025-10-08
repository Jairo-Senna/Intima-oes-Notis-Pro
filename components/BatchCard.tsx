import React from 'react';
import { Batch, DeliveryPerson } from '../types';

interface BatchCardProps {
    batch: Batch;
    deliveryPerson?: DeliveryPerson;
    onClick: () => void;
}

const BatchCard: React.FC<BatchCardProps> = ({ batch, deliveryPerson, onClick }) => {
    const now = new Date();
    let statusStyling = '';
    let statusText = 'PENDENTE';

    if (batch.status === 'finalized') {
        statusStyling = 'border-l-green-500 bg-green-500/10 hover:bg-green-500/20';
        statusText = 'FINALIZADO';
    } else if (new Date(batch.estimatedReturnDate) < now) {
        statusStyling = 'border-l-red-500 bg-red-500/10 hover:bg-red-500/20';
        statusText = 'ATRASADO';
    } else {
        statusStyling = 'border-l-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20';
        statusText = 'PENDENTE';
    }

    const pgfnCount = batch.pgfnInitial;
    const normalCount = batch.normalInitial;

    return (
        <div 
            className={`border-l-4 rounded-lg p-4 cursor-pointer transition-all duration-300 hover:-translate-y-1 shadow-lg ${statusStyling}`}
            onClick={onClick}
        >
            <div className="flex justify-between items-start">
                <h3 className="font-bold text-lg text-white">Lote #{batch.id.substring(0, 8)}</h3>
                <span className={`font-bold text-xs px-2 py-1 rounded-full ${
                    statusText === 'PENDENTE' ? 'bg-yellow-500/20 text-yellow-400' : 
                    statusText === 'ATRASADO' ? 'bg-red-500/20 text-red-400' : 
                    'bg-green-500/20 text-green-400'
                }`}>
                    {statusText}
                </span>
            </div>
            <div className="mt-3 text-sm text-gray-300 space-y-2">
                <p><strong>Entregador:</strong> {deliveryPerson?.name || 'Desconhecido'}</p>
                <p><strong>Remessas:</strong> {pgfnCount} PGFN / {normalCount} Normais</p>
                <p><strong>Saída:</strong> {new Date(batch.departureDatetime).toLocaleString('pt-BR')}</p>
                {batch.status === 'pending' ? (
                    <p><strong>Devolução:</strong> {new Date(batch.estimatedReturnDate).toLocaleDateString('pt-BR')}</p>
                ) : (
                    <>
                        <p><strong>Finalizado:</strong> {batch.returnDatetime ? new Date(batch.returnDatetime).toLocaleString('pt-BR') : '-'}</p>
                        <p className="font-bold text-green-400"><strong>Valor:</strong> R$ {batch.totalValue?.toFixed(2) || '0.00'}</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default BatchCard;