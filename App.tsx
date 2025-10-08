

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { z } from 'zod';
import { Batch, DeliveryPerson, View } from './types';
import { generateBatchDescription } from './services/geminiService';
import { MenuIcon, CloseIcon, DashboardIcon, ArchiveIcon, UserGroupIcon, UserAddIcon, PlusIcon, GeminiIcon } from './components/icons';
import Modal from './components/Modal';
import BatchCard from './components/BatchCard';

// --- CONSTANTS ---
const DELIVERY_FEE = 3;
const ARCHIVE_DELAY_DAYS = 4;
const LOCAL_STORAGE_KEY = 'deliverySystemData';

// --- ZOD SCHEMAS & UTILS ---
const getZodFieldErrors = (error: z.ZodError) => {
    const fieldErrors = error.flatten().fieldErrors;
    const newErrors: Record<string, string> = {};
    for (const key in fieldErrors) {
        if (fieldErrors[key]?.[0]) {
            newErrors[key] = fieldErrors[key]![0];
        }
    }
    return newErrors;
};

const deliveryPersonSchema = z.object({
    name: z.string().min(1, { message: "O nome completo é obrigatório." }),
    cpf: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    pix: z.string().optional(),
    route: z.string().optional(),
});

const newBatchSchema = z.object({
    deliveryPersonId: z.string().min(1, { message: "Selecione um entregador." }),
    pgfnInitial: z.coerce.number().min(0, "O valor deve ser zero ou maior."),
    normalInitial: z.coerce.number().min(0, "O valor deve ser zero ou maior."),
    departureDatetime: z.string().min(1, { message: "A data de saída é obrigatória." }),
    estimatedReturnDate: z.string().min(1, { message: "A data de devolução é obrigatória." }),
    description: z.string(),
}).refine(data => data.pgfnInitial > 0 || data.normalInitial > 0, {
    message: "Adicione ao menos uma intimação (PGFN ou Normal).",
    path: ["pgfnInitial"], 
});

const createFinalizeBatchSchema = (batch: Batch) => z.object({
    returnDatetime: z.string().min(1, 'A data e hora do retorno são obrigatórias.'),
    pgfnDelivered: z.coerce.number().min(0),
    pgfnReturned: z.coerce.number().min(0),
    pgfnAbsent: z.coerce.number().min(0),
    normalDelivered: z.coerce.number().min(0),
    normalReturned: z.coerce.number().min(0),
    normalAbsent: z.coerce.number().min(0),
}).superRefine((data, ctx) => {
    if (data.pgfnDelivered + data.pgfnReturned + data.pgfnAbsent !== batch.pgfnInitial) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A soma para PGFN deve ser ${batch.pgfnInitial}.`, path: ['pgfn'] });
    }
    if (data.normalDelivered + data.normalReturned + data.normalAbsent !== batch.normalInitial) {
         ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A soma para Normais deve ser ${batch.normalInitial}.`, path: ['normal'] });
    }
});

const createEditBatchSchema = (batch: Batch) => createFinalizeBatchSchema(batch).omit({ returnDatetime: true });


// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
    // --- STATE MANAGEMENT ---
    const [view, setView] = useState<View>(View.Dashboard);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>([]);
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    
    // Modal states
    const [modalState, setModalState] = useState({
        newBatch: false,
        finalizeBatch: false,
        batchDetails: false,
        editBatch: false,
        editPerson: false,
        confirm: false,
    });
    
    const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
    const [selectedPerson, setSelectedPerson] = useState<DeliveryPerson | null>(null);
    const [confirmModalProps, setConfirmModalProps] = useState({ message: '', onConfirm: () => {} });

    // Filter states
    const [filters, setFilters] = useState({
        dashboard: { status: 'all', person: '', search: '' },
        archive: { person: '' }
    });

    // --- DATA PERSISTENCE (LOCALSTORAGE) ---
    useEffect(() => {
        try {
            const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (storedData) {
                const data = JSON.parse(storedData);
                setBatches(data.batches || []);
                setDeliveryPeople(data.deliveryPeople || []);
            }
        } catch (error) {
            console.error("Failed to load data from localStorage", error);
        }
    }, []);

    useEffect(() => {
        try {
            const data = { batches, deliveryPeople };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error("Failed to save data to localStorage", error);
        }
    }, [batches, deliveryPeople]);

    // --- NAVIGATION ---
    const navigate = useCallback((newView: View) => {
        setView(newView);
        setSidebarOpen(false);
        setSelectedPerson(null);
    }, []);

    // --- DATA HANDLERS ---
    const addDeliveryPerson = useCallback((person: Omit<DeliveryPerson, 'id'>) => {
        const newPerson = { ...person, id: Date.now().toString() };
        setDeliveryPeople(prev => [...prev, newPerson].sort((a,b) => a.name.localeCompare(b.name)));
    }, []);
    
    const updateDeliveryPerson = useCallback((updatedPerson: DeliveryPerson) => {
        setDeliveryPeople(prev => prev.map(p => p.id === updatedPerson.id ? updatedPerson : p).sort((a,b) => a.name.localeCompare(b.name)));
        setSelectedPerson(updatedPerson);
    }, []);
    
    const deleteDeliveryPerson = useCallback((personId: string) => {
        setDeliveryPeople(prev => prev.filter(p => p.id !== personId));
        setBatches(prev => prev.filter(b => b.deliveryPersonId !== personId));
        navigate(View.Dashboard);
    }, [navigate]);

    const addBatch = useCallback((batch: Omit<Batch, 'id'>) => {
        const newBatch = { ...batch, id: Date.now().toString() };
        setBatches(prev => [newBatch, ...prev]);
    }, []);
    
    const updateBatch = useCallback((updatedBatch: Batch) => {
         setBatches(prev => prev.map(b => b.id === updatedBatch.id ? updatedBatch : b));
    }, []);

    const deleteBatch = useCallback((batchId: string) => {
        setBatches(prev => prev.filter(b => b.id !== batchId));
    }, []);

    // --- UI HANDLERS ---
    const openModal = useCallback((modalName: keyof typeof modalState) => {
        setModalState(prev => ({ ...prev, [modalName]: true }));
    }, []);

    const closeModal = useCallback((modalName: keyof typeof modalState) => {
        setModalState(prev => ({ ...prev, [modalName]: false }));
        // Reset selections on close
        if (['finalizeBatch', 'batchDetails', 'editBatch'].includes(modalName)) {
            setSelectedBatch(null);
        }
        if (modalName === 'editPerson') {
            setSelectedPerson(p => p?.id === selectedPerson?.id ? null : p);
        }
    }, [selectedPerson?.id]);

    const openConfirmation = useCallback((message: string, onConfirm: () => void) => {
        setConfirmModalProps({ message, onConfirm });
        openModal('confirm');
    }, [openModal]);


    // --- MEMOIZED DATA & FILTERS ---
    const { dashboardBatches, archivedBatches } = useMemo(() => {
        const now = new Date();
        const main: Batch[] = [];
        const archived: Batch[] = [];

        batches.forEach(batch => {
            if (batch.status === 'finalized' && batch.returnDatetime) {
                const diffDays = (now.getTime() - new Date(batch.returnDatetime).getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays > ARCHIVE_DELAY_DAYS) archived.push(batch);
                else main.push(batch);
            } else {
                main.push(batch);
            }
        });
        const sortFn = (a: Batch, b: Batch) => new Date(b.departureDatetime).getTime() - new Date(a.departureDatetime).getTime();
        return { dashboardBatches: main.sort(sortFn), archivedBatches: archived.sort(sortFn) };
    }, [batches]);

    const filteredDashboardBatches = useMemo(() => {
        const { status, person, search } = filters.dashboard;
        return dashboardBatches.filter(batch => {
            const searchTermMatch = search ? batch.id.toLowerCase().includes(search.toLowerCase()) || deliveryPeople.find(p=>p.id === batch.deliveryPersonId)?.name.toLowerCase().includes(search.toLowerCase()) : true;
            const statusFilterMatch = status === 'all' || batch.status === status;
            const personFilterMatch = !person || batch.deliveryPersonId === person;
            return searchTermMatch && statusFilterMatch && personFilterMatch;
        });
    }, [dashboardBatches, filters.dashboard, deliveryPeople]);

    const filteredArchivedBatches = useMemo(() => {
        const { person } = filters.archive;
        return archivedBatches.filter(batch => !person || batch.deliveryPersonId === person);
    }, [archivedBatches, filters.archive]);

    const { summary, performance } = useMemo(() => {
        const summary = { totalGains: 0, totalDelivered: 0, totalReturned: 0, totalAbsent: 0 };
        const performance: { [key: string]: { gains: number; delivered: number; returned: number; name: string } } = {};
        deliveryPeople.forEach(p => { performance[p.id] = { gains: 0, delivered: 0, returned: 0, name: p.name }; });

        dashboardBatches.forEach(batch => {
            if (batch.status === 'finalized' && batch.totalValue) {
                summary.totalGains += batch.totalValue;
                const delivered = (batch.pgfnDelivered || 0) + (batch.normalDelivered || 0);
                const returned = (batch.pgfnReturned || 0) + (batch.normalReturned || 0);
                summary.totalDelivered += delivered;
                summary.totalReturned += returned;
                summary.totalAbsent += (batch.pgfnAbsent || 0) + (batch.normalAbsent || 0);
                
                if (performance[batch.deliveryPersonId]) {
                    performance[batch.deliveryPersonId].gains += batch.totalValue;
                    performance[batch.deliveryPersonId].delivered += delivered;
                    performance[batch.deliveryPersonId].returned += returned;
                }
            }
        });
        return { summary, performance };
    }, [dashboardBatches, deliveryPeople]);


    // --- VIEW RENDERER ---
    const renderView = () => {
        switch (view) {
            case View.Dashboard:
                return <DashboardView batches={filteredDashboardBatches} deliveryPeople={deliveryPeople} onBatchClick={b => { setSelectedBatch(b); openModal(b.status === 'pending' ? 'finalizeBatch' : 'batchDetails'); }} summary={summary} performance={performance} filters={filters.dashboard} setFilters={newFilters => setFilters(f => ({...f, dashboard: {...f.dashboard, ...newFilters}}))} />;
            case View.Archive:
                 return <ArchiveView batches={filteredArchivedBatches} deliveryPeople={deliveryPeople} onBatchClick={b => { setSelectedBatch(b); openModal('batchDetails'); }} filters={filters.archive} setFilters={newFilters => setFilters(f => ({...f, archive: {...f.archive, ...newFilters}}))} />;
            case View.DeliveryPeople:
                return <DeliveryPeopleView people={deliveryPeople} onSelectPerson={p => { setSelectedPerson(p); navigate(View.DeliveryPersonProfile); }} />;
            case View.AddDeliveryPerson:
                return <AddDeliveryPersonView onAdd={person => { addDeliveryPerson(person); navigate(View.DeliveryPeople); }} />;
            case View.DeliveryPersonProfile:
                 return selectedPerson ? <DeliveryPersonProfileView person={selectedPerson} batches={batches} onEdit={() => openModal('editPerson')} onDelete={(id) => openConfirmation('Tem certeza que deseja excluir este entregador e todos os lotes associados?', () => deleteDeliveryPerson(id))} /> : <p className="text-center text-gray-400">Selecione um entregador para ver seu perfil.</p>;
            default:
                return <h1 className="text-red-500">View not found</h1>;
        }
    };
    
    // --- RENDER ---
    return (
        <div className="flex min-h-screen bg-black">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} navigate={navigate} currentView={view} />
            <div className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : ''}`}>
                <Header onMenuClick={() => setSidebarOpen(true)} />
                <main className="p-4 sm:p-6 lg:p-8">
                    {renderView()}
                </main>
                <Footer />
            </div>

            {/* Modals */}
            <NewBatchModal isOpen={modalState.newBatch} onClose={() => closeModal('newBatch')} onAdd={addBatch} deliveryPeople={deliveryPeople} />
            {selectedBatch && <FinalizeBatchModal isOpen={modalState.finalizeBatch} onClose={() => closeModal('finalizeBatch')} onFinalize={updateBatch} batch={selectedBatch} deliveryPerson={deliveryPeople.find(p => p.id === selectedBatch.deliveryPersonId)} />}
            {selectedBatch && <BatchDetailsModal isOpen={modalState.batchDetails} onClose={() => closeModal('batchDetails')} batch={selectedBatch} deliveryPerson={deliveryPeople.find(p => p.id === selectedBatch.deliveryPersonId)} onEdit={() => { closeModal('batchDetails'); openModal('editBatch'); }} onDelete={(id) => openConfirmation('Tem certeza que deseja excluir este lote?', () => deleteBatch(id))} />}
            {selectedBatch && <EditBatchModal isOpen={modalState.editBatch} onClose={() => closeModal('editBatch')} onEdit={updateBatch} batch={selectedBatch} />}
            {selectedPerson && <EditDeliveryPersonModal isOpen={modalState.editPerson} onClose={() => closeModal('editPerson')} onEdit={updateDeliveryPerson} person={selectedPerson} />}
            <ConfirmationModal isOpen={modalState.confirm} onClose={() => closeModal('confirm')} message={confirmModalProps.message} onConfirm={confirmModalProps.onConfirm} />
            
            <button onClick={() => openModal('newBatch')} className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-lg transition-transform hover:scale-110 z-20" aria-label="Adicionar Novo Lote">
                <PlusIcon />
            </button>
        </div>
    );
};


// --- SUB-COMPONENTS ---

const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void; navigate: (view: View) => void, currentView: View }> = ({ isOpen, onClose, navigate, currentView }) => {
    const navItems = [
        { icon: <DashboardIcon />, label: 'Painel', view: View.Dashboard },
        { icon: <ArchiveIcon />, label: 'Histórico', view: View.Archive },
        { icon: <UserGroupIcon />, label: 'Entregadores', view: View.DeliveryPeople },
        { icon: <UserAddIcon />, label: 'Novo Entregador', view: View.AddDeliveryPerson },
    ];
    return (
        <>
            <aside className={`fixed top-0 left-0 h-full w-64 bg-black/70 backdrop-blur-lg border-r border-white/10 z-40 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
                <div className="p-4 flex justify-between items-center h-16 border-b border-white/10">
                    <h2 className="text-xl font-bold">NOTIS PRO</h2>
                    <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white" aria-label="Fechar menu">
                        <CloseIcon />
                    </button>
                </div>
                <nav className="mt-4">
                    <ul>
                        {navItems.map(item => (
                            <li key={item.label} className="px-4 py-2">
                                <button onClick={() => navigate(item.view)} className={`w-full flex items-center text-left p-3 rounded-lg transition-colors ${currentView === item.view ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}>
                                    {item.icon} {item.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>
            {isOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} aria-hidden="true"></div>}
        </>
    );
};

const Header: React.FC<{ onMenuClick: () => void }> = ({ onMenuClick }) => (
    <header className="sticky top-0 bg-black/80 backdrop-blur-sm z-20 p-4 border-b border-white/10 flex items-center h-16 lg:hidden">
        <button onClick={onMenuClick} className="text-gray-300 hover:text-white" aria-label="Abrir menu">
            <MenuIcon />
        </button>
        <div className="flex-1 text-center">
            <h1 className="text-xl font-bold">NOTIS PRO</h1>
        </div>
        <div className="w-6"></div>
    </header>
);

const Footer: React.FC = () => (
    <footer className="text-center p-6 mt-8 text-xs text-gray-500 border-t border-white/10">
        <p>© {new Date().getFullYear()} NOTIS PRO. Todos os direitos reservados.</p>
        <p>Desenvolvido por Jairo Senna</p>
    </footer>
);

// Form Components
// Fix: Correctly type the polymorphic FormInput component to support both input and textarea attributes.
type FormInputProps = {
    label: string;
    error?: string;
} & (
    | (React.InputHTMLAttributes<HTMLInputElement> & { as?: 'input' | undefined })
    | (React.TextareaHTMLAttributes<HTMLTextAreaElement> & { as: 'textarea' })
);
const FormInput: React.FC<FormInputProps> = ({ label, id, as, error, ...props }) => (
    <div className="mb-2">
        <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        {as === 'textarea' ? (
            <textarea id={id} {...props as React.TextareaHTMLAttributes<HTMLTextAreaElement>} className={`w-full bg-white/10 border rounded-lg p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition ${error ? 'border-red-500' : 'border-white/20'}`} />
        ) : (
            <input id={id} {...props as React.InputHTMLAttributes<HTMLInputElement>} className={`w-full bg-white/10 border rounded-lg p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition ${error ? 'border-red-500' : 'border-white/20'}`} />
        )}
        {error && <p className="text-red-500 text-xs mt-1" role="alert">{error}</p>}
    </div>
);

const FormSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: React.ReactNode; error?: string }> = ({ label, id, children, error, ...props }) => (
     <div className="mb-2">
        <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <select id={id} {...props} className={`w-full bg-white/10 border rounded-lg p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition ${error ? 'border-red-500' : 'border-white/20'}`}>
            {children}
        </select>
        {error && <p className="text-red-500 text-xs mt-1" role="alert">{error}</p>}
    </div>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'gemini' }> = ({ children, variant = 'primary', ...props }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 flex items-center justify-center';
    const variantClasses = {
        primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        secondary: 'bg-white/10 hover:bg-white/20 text-white',
        danger: 'bg-red-600 hover:bg-red-700 text-white',
        gemini: 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white',
    };
    return <button {...props} className={`${baseClasses} ${variantClasses[variant]}`}>{children}</button>;
};

// --- VIEWS ---

const DashboardView: React.FC<{ batches: Batch[]; deliveryPeople: DeliveryPerson[]; onBatchClick: (batch: Batch) => void; summary: any; performance: any; filters: any; setFilters: (newFilters: any) => void; }> = ({ batches, deliveryPeople, onBatchClick, summary, performance, filters, setFilters }) => (
    <div className="space-y-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold">Painel</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/5 p-4 rounded-lg"><p className="text-gray-400 text-sm">Receita Total</p><p className="text-2xl font-bold">R$ {summary.totalGains.toFixed(2)}</p></div>
            <div className="bg-white/5 p-4 rounded-lg"><p className="text-gray-400 text-sm">Entregues</p><p className="text-2xl font-bold">{summary.totalDelivered}</p></div>
            <div className="bg-white/5 p-4 rounded-lg"><p className="text-gray-400 text-sm">Devolvidas</p><p className="text-2xl font-bold">{summary.totalReturned}</p></div>
            <div className="bg-white/5 p-4 rounded-lg"><p className="text-gray-400 text-sm">Ausentes</p><p className="text-2xl font-bold">{summary.totalAbsent}</p></div>
        </div>
        <div>
            <h2 className="text-2xl font-bold mb-4">Desempenho</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(performance).sort((a: any, b: any) => a.name.localeCompare(b.name)).map((p: any) => (
                    <div key={p.name} className="bg-white/5 p-4 rounded-lg">
                        <h3 className="font-semibold text-white">{p.name}</h3>
                        <p className="text-sm text-gray-300">Ganhos: <span className="font-bold text-green-400">R$ {p.gains.toFixed(2)}</span></p>
                        <p className="text-sm text-gray-300">Entregas: {p.delivered} | Devoluções: {p.returned}</p>
                    </div>
                ))}
            </div>
        </div>
        <div>
             <h2 className="text-2xl font-bold mb-4">Lotes Ativos</h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-white/5 rounded-lg items-end">
                <FormSelect label="Status" value={filters.status} onChange={e => setFilters({ status: e.target.value })}>
                    <option value="all">Todos</option>
                    <option value="pending">Pendentes</option>
                    <option value="finalized">Finalizados</option>
                </FormSelect>
                 <FormSelect label="Entregador" value={filters.person} onChange={e => setFilters({ person: e.target.value })}>
                    <option value="">Todos</option>
                    {deliveryPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </FormSelect>
                <FormInput label="Buscar Lote/Entregador" type="text" placeholder="ID ou nome..." value={filters.search} onChange={e => setFilters({ search: e.target.value })} />
             </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {batches.length > 0 ? batches.map(batch => <BatchCard key={batch.id} batch={batch} deliveryPerson={deliveryPeople.find(p => p.id === batch.deliveryPersonId)} onClick={() => onBatchClick(batch)} />) : <p className="text-gray-400 col-span-full text-center py-8">Nenhum lote ativo encontrado.</p>}
            </div>
        </div>
    </div>
);

const ArchiveView: React.FC<{ batches: Batch[]; deliveryPeople: DeliveryPerson[]; onBatchClick: (batch: Batch) => void; filters: any; setFilters: any; }> = ({ batches, deliveryPeople, onBatchClick, filters, setFilters }) => (
    <div className="space-y-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold">Histórico de Remessas</h1>
         <div className="p-4 bg-white/5 rounded-lg">
             <FormSelect label="Filtrar por Entregador" value={filters.person} onChange={e => setFilters({ person: e.target.value })}>
                <option value="">Todos Entregadores</option>
                {deliveryPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FormSelect>
         </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {batches.length > 0 ? batches.map(batch => <BatchCard key={batch.id} batch={batch} deliveryPerson={deliveryPeople.find(p => p.id === batch.deliveryPersonId)} onClick={() => onBatchClick(batch)} />) : <p className="text-gray-400 col-span-full text-center py-8">Nenhum lote arquivado.</p>}
        </div>
    </div>
);

const DeliveryPeopleView: React.FC<{ people: DeliveryPerson[]; onSelectPerson: (person: DeliveryPerson) => void }> = ({ people, onSelectPerson }) => (
    <div className="space-y-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold">Entregadores</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {people.map(person => (
                <button key={person.id} onClick={() => onSelectPerson(person)} className="bg-white/5 p-4 rounded-lg text-center transition-all duration-300 hover:bg-white/10 hover:-translate-y-1">
                    <p className="font-semibold text-lg">{person.name}</p>
                    <p className="text-sm text-gray-400">{person.route || 'Rota não definida'}</p>
                </button>
            ))}
        </div>
    </div>
);

const AddDeliveryPersonView: React.FC<{ onAdd: (person: Omit<DeliveryPerson, 'id'>) => void }> = ({ onAdd }) => {
    const [errors, setErrors] = useState<Record<string, string>>({});
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const personData = Object.fromEntries(new FormData(e.currentTarget).entries());
        const result = deliveryPersonSchema.safeParse(personData);
        if(!result.success) { setErrors(getZodFieldErrors(result.error)); return; }
        setErrors({});
        onAdd(result.data);
    };
    return (
        <div className="max-w-2xl mx-auto animate-fade-in-up">
            <h1 className="text-3xl font-bold mb-8">Novo Entregador</h1>
            <form onSubmit={handleSubmit} className="bg-white/5 p-8 rounded-lg" noValidate>
                <FormInput label="Nome Completo" id="name" name="name" type="text" error={errors.name} required />
                <FormInput label="CPF" id="cpf" name="cpf" type="text" error={errors.cpf} />
                <FormInput label="Endereço" id="address" name="address" type="text" error={errors.address} />
                <FormInput label="Telefone" id="phone" name="phone" type="tel" error={errors.phone} />
                <FormInput label="WhatsApp" id="whatsapp" name="whatsapp" type="tel" error={errors.whatsapp} />
                <FormInput label="Chave PIX" id="pix" name="pix" type="text" error={errors.pix} />
                <FormInput label="Rota de Preferência" id="route" name="route" type="text" error={errors.route} />
                <div className="mt-6"><Button type="submit" className="w-full">Salvar Entregador</Button></div>
            </form>
        </div>
    );
};

const DeliveryPersonProfileView: React.FC<{ person: DeliveryPerson; batches: Batch[]; onEdit: () => void; onDelete: (id: string) => void; }> = ({ person, batches, onEdit, onDelete }) => {
    const stats = useMemo(() => {
        const finalized = batches.filter(b => b.deliveryPersonId === person.id && b.status === 'finalized');
        return {
            delivered: finalized.reduce((s, b) => s + (b.pgfnDelivered || 0) + (b.normalDelivered || 0), 0),
            returned: finalized.reduce((s, b) => s + (b.pgfnReturned || 0) + (b.normalReturned || 0), 0),
            pending: batches.filter(b => b.deliveryPersonId === person.id && b.status === 'pending').length,
        };
    }, [person, batches]);
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
            <h1 className="text-3xl font-bold">{person.name}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/5 p-6 rounded-lg space-y-2">
                    <h3 className="text-xl font-semibold mb-3">Informações</h3>
                    <p><strong>Endereço:</strong> {person.address || 'Não informado'}</p>
                    <p><strong>Telefone:</strong> {person.phone || 'Não informado'}</p>
                    <p><strong>WhatsApp:</strong> {person.whatsapp || 'Não informado'}</p>
                    <p><strong>PIX:</strong> {person.pix || 'Não informado'}</p>
                    <p><strong>CPF:</strong> {person.cpf || 'Não informado'}</p>
                    <p><strong>Rota:</strong> {person.route || 'Não definida'}</p>
                </div>
                 <div className="bg-white/5 p-6 rounded-lg space-y-2">
                    <h3 className="text-xl font-semibold mb-3">Desempenho Geral</h3>
                    <p><strong>Entregas Concluídas:</strong> {stats.delivered}</p>
                    <p><strong>Devoluções:</strong> {stats.returned}</p>
                    <p><strong>Lotes Pendentes:</strong> {stats.pending}</p>
                </div>
            </div>
            <div className="flex gap-4"><Button onClick={onEdit}>Editar Informações</Button><Button variant="danger" onClick={() => onDelete(person.id)}>Excluir Entregador</Button></div>
        </div>
    );
};

// --- MODALS ---

const NewBatchModal: React.FC<{ isOpen: boolean; onClose: () => void; onAdd: (batch: Omit<Batch, 'id'>) => void; deliveryPeople: DeliveryPerson[] }> = ({ isOpen, onClose, onAdd, deliveryPeople }) => {
    const [description, setDescription] = useState('');
    const [isGenerating, setGenerating] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    useEffect(() => { if (isOpen) { setDescription(''); setErrors({}); } }, [isOpen]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget).entries());
        const result = newBatchSchema.safeParse({ ...data, description });
        if (!result.success) { setErrors(getZodFieldErrors(result.error)); return; }
        onAdd({ ...result.data, status: 'pending' });
        onClose();
    };

    const handleGenerateDescription = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const form = (e.target as HTMLElement).closest('form');
        if(!form) return;
        const data = Object.fromEntries(new FormData(form).entries());
        const person = deliveryPeople.find(p => p.id === data.deliveryPersonId);
        if (!person) { setErrors({ deliveryPersonId: 'Selecione um entregador.' }); return; }
        setErrors({});
        setGenerating(true);
        const prompt = `Gere uma descrição profissional para um lote de intimações para o entregador ${person.name} (rota: ${person.route || 'N/A'}). O lote contém ${data.pgfnInitial || 0} intimações PGFN e ${data.normalInitial || 0} normais.`;
        setDescription(await generateBatchDescription(prompt));
        setGenerating(false);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Novo Lote">
            <form onSubmit={handleSubmit} noValidate>
                <FormSelect label="Entregador" id="deliveryPersonId" name="deliveryPersonId" error={errors.deliveryPersonId} required><option value="">Selecione</option>{deliveryPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</FormSelect>
                <div className="grid grid-cols-2 gap-4">
                    <FormInput label="Intimações PGFN" id="pgfnInitial" name="pgfnInitial" type="number" min="0" defaultValue="0" error={errors.pgfnInitial} />
                    <FormInput label="Intimações Normais" id="normalInitial" name="normalInitial" type="number" min="0" defaultValue="0" error={errors.normalInitial} />
                </div>
                <FormInput label="Data/Hora de Saída" id="departureDatetime" name="departureDatetime" type="datetime-local" error={errors.departureDatetime} required />
                <FormInput label="Data Devolução Estimada" id="estimatedReturnDate" name="estimatedReturnDate" type="date" error={errors.estimatedReturnDate} required />
                <FormInput as="textarea" label="Descrição" id="description" name="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                <Button type="button" variant="gemini" onClick={handleGenerateDescription} disabled={isGenerating} className="w-full mb-4"><GeminiIcon /> {isGenerating ? 'Gerando...' : 'Gerar Descrição com IA'}</Button>
                <div className="flex justify-end"><Button type="submit">Registrar Lote</Button></div>
            </form>
        </Modal>
    );
};

const FinalizeBatchModal: React.FC<{isOpen: boolean, onClose: () => void, onFinalize: (batch: Batch) => void, batch: Batch, deliveryPerson?: DeliveryPerson}> = ({isOpen, onClose, onFinalize, batch, deliveryPerson}) => {
     const [errors, setErrors] = useState<Record<string, string>>({});
     useEffect(() => { if (isOpen) setErrors({}); }, [isOpen]);
     const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget).entries());
        const result = createFinalizeBatchSchema(batch).safeParse(data);
        if (!result.success) { setErrors(getZodFieldErrors(result.error)); return; }
        const { returnDatetime, ...counts } = result.data;
        const totalPaidItems = counts.pgfnDelivered + counts.pgfnReturned + counts.normalDelivered + counts.normalReturned;
        onFinalize({ ...batch, status: 'finalized', returnDatetime: new Date(returnDatetime).toISOString(), ...counts, totalValue: totalPaidItems * DELIVERY_FEE });
        onClose();
     };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Finalizar Lote #${batch.id.substring(0,8)}`}>
            <form onSubmit={handleSubmit} noValidate>
                <FormInput label="Data e Hora de Retorno" id="returnDatetime" name="returnDatetime" type="datetime-local" error={errors.returnDatetime} required />
                <fieldset className="border border-white/20 p-4 rounded-lg my-4"><legend className="px-2 font-semibold">PGFN ({batch.pgfnInitial})</legend><div className="grid grid-cols-3 gap-2"><FormInput label="Entregues" name="pgfnDelivered" type="number" min="0" defaultValue="0" /><FormInput label="Devoluções" name="pgfnReturned" type="number" min="0" defaultValue="0" /><FormInput label="Ausentes" name="pgfnAbsent" type="number" min="0" defaultValue="0" /></div>{errors.pgfn && <p className="text-red-500 text-xs mt-1">{errors.pgfn}</p>}</fieldset>
                <fieldset className="border border-white/20 p-4 rounded-lg mb-4"><legend className="px-2 font-semibold">Normais ({batch.normalInitial})</legend><div className="grid grid-cols-3 gap-2"><FormInput label="Entregues" name="normalDelivered" type="number" min="0" defaultValue="0" /><FormInput label="Devoluções" name="normalReturned" type="number" min="0" defaultValue="0" /><FormInput label="Ausentes" name="normalAbsent" type="number" min="0" defaultValue="0" /></div>{errors.normal && <p className="text-red-500 text-xs mt-1">{errors.normal}</p>}</fieldset>
                <div className="flex justify-end"><Button type="submit">Finalizar Lote</Button></div>
            </form>
        </Modal>
    )
}

const BatchDetailsModal: React.FC<{isOpen: boolean, onClose: () => void, batch: Batch, deliveryPerson?: DeliveryPerson, onEdit: () => void, onDelete: (id: string) => void}> = ({isOpen, onClose, batch, deliveryPerson, onEdit, onDelete}) => (
    <Modal isOpen={isOpen} onClose={onClose} title={`Detalhes do Lote #${batch.id.substring(0,8)}`}>
        <div className="space-y-3 text-gray-300">
            <p><strong>Entregador:</strong> {deliveryPerson?.name}</p>
            <p><strong>Saída:</strong> {new Date(batch.departureDatetime).toLocaleString('pt-BR')}</p>
            <p><strong>Retorno:</strong> {batch.returnDatetime ? new Date(batch.returnDatetime).toLocaleString('pt-BR') : 'Pendente'}</p>
            <p className="text-lg font-bold text-green-400">Valor Total: R$ {batch.totalValue?.toFixed(2) || '0.00'}</p>
            {batch.description && <p className="text-sm italic border-l-2 border-white/20 pl-2"><strong>Descrição:</strong> {batch.description}</p>}
            <hr className="border-white/10 my-4" />
            <div className="grid grid-cols-2 gap-4">
                <div><h4 className="font-semibold text-white">PGFN ({batch.pgfnInitial})</h4><ul><li>Entregues: {batch.pgfnDelivered || 0}</li><li>Devoluções: {batch.pgfnReturned || 0}</li><li>Ausentes: {batch.pgfnAbsent || 0}</li></ul></div>
                <div><h4 className="font-semibold text-white">Normais ({batch.normalInitial})</h4><ul><li>Entregues: {batch.normalDelivered || 0}</li><li>Devoluções: {batch.normalReturned || 0}</li><li>Ausentes: {batch.normalAbsent || 0}</li></ul></div>
            </div>
            <div className="flex justify-end gap-4 mt-6"><Button variant="secondary" onClick={onEdit}>Editar</Button><Button variant="danger" onClick={() => {onDelete(batch.id); onClose();}}>Excluir</Button></div>
        </div>
    </Modal>
);

const EditBatchModal: React.FC<{isOpen: boolean, onClose: () => void, onEdit: (batch: Batch) => void, batch: Batch}> = ({isOpen, onClose, onEdit, batch}) => {
    const [errors, setErrors] = useState<Record<string, string>>({});
    useEffect(() => { if (isOpen) setErrors({}); }, [isOpen]);
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget).entries());
        const result = createEditBatchSchema(batch).safeParse(data);
        if (!result.success) { setErrors(getZodFieldErrors(result.error)); return; }
        const counts = result.data;
        const totalPaidItems = counts.pgfnDelivered + counts.pgfnReturned + counts.normalDelivered + counts.normalReturned;
        onEdit({ ...batch, ...counts, totalValue: totalPaidItems * DELIVERY_FEE });
        onClose();
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Editar Lote #${batch.id.substring(0,8)}`}>
            <form onSubmit={handleSubmit} noValidate>
                <fieldset className="border border-white/20 p-4 rounded-lg my-4"><legend className="px-2 font-semibold">PGFN ({batch.pgfnInitial})</legend><div className="grid grid-cols-3 gap-2"><FormInput label="Entregues" name="pgfnDelivered" type="number" min="0" defaultValue={batch.pgfnDelivered || 0} /><FormInput label="Devoluções" name="pgfnReturned" type="number" min="0" defaultValue={batch.pgfnReturned || 0} /><FormInput label="Ausentes" name="pgfnAbsent" type="number" min="0" defaultValue={batch.pgfnAbsent || 0} /></div>{errors.pgfn && <p className="text-red-500 text-xs mt-1">{errors.pgfn}</p>}</fieldset>
                <fieldset className="border border-white/20 p-4 rounded-lg mb-4"><legend className="px-2 font-semibold">Normais ({batch.normalInitial})</legend><div className="grid grid-cols-3 gap-2"><FormInput label="Entregues" name="normalDelivered" type="number" min="0" defaultValue={batch.normalDelivered || 0} /><FormInput label="Devoluções" name="normalReturned" type="number" min="0" defaultValue={batch.normalReturned || 0} /><FormInput label="Ausentes" name="normalAbsent" type="number" min="0" defaultValue={batch.normalAbsent || 0} /></div>{errors.normal && <p className="text-red-500 text-xs mt-1">{errors.normal}</p>}</fieldset>
                <div className="flex justify-end"><Button type="submit">Salvar Alterações</Button></div>
            </form>
        </Modal>
    );
};

const EditDeliveryPersonModal: React.FC<{isOpen: boolean, onClose: () => void, onEdit: (person: DeliveryPerson) => void, person: DeliveryPerson}> = ({isOpen, onClose, onEdit, person}) => {
    const [errors, setErrors] = useState<Record<string, string>>({});
    useEffect(() => { if (isOpen) setErrors({}); }, [isOpen]);
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget).entries());
        const result = deliveryPersonSchema.safeParse(data);
        if(!result.success) { setErrors(getZodFieldErrors(result.error)); return; }
        onEdit({ ...person, ...result.data });
        onClose();
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Entregador">
            <form onSubmit={handleSubmit} noValidate>
                <FormInput label="Nome Completo" name="name" type="text" defaultValue={person.name} error={errors.name} required />
                <FormInput label="CPF" name="cpf" type="text" defaultValue={person.cpf} error={errors.cpf} />
                <FormInput label="Endereço" name="address" type="text" defaultValue={person.address} error={errors.address} />
                <FormInput label="Telefone" name="phone" type="tel" defaultValue={person.phone} error={errors.phone} />
                <FormInput label="WhatsApp" name="whatsapp" type="tel" defaultValue={person.whatsapp} error={errors.whatsapp} />
                <FormInput label="Chave PIX" name="pix" type="text" defaultValue={person.pix} error={errors.pix} />
                <FormInput label="Rota de Preferência" name="route" type="text" defaultValue={person.route} error={errors.route} />
                <div className="mt-6 flex justify-end"><Button type="submit">Salvar Alterações</Button></div>
            </form>
        </Modal>
    );
};

const ConfirmationModal: React.FC<{isOpen: boolean, onClose: () => void, message: string, onConfirm: () => void}> = ({isOpen, onClose, message, onConfirm}) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmar Ação">
        <p className="mb-6">{message}</p>
        <div className="flex justify-end gap-4">
            <Button variant="secondary" onClick={onClose}>Não</Button>
            <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>Sim</Button>
        </div>
    </Modal>
);

export default App;