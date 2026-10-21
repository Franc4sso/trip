import { Head, Link } from '@inertiajs/react';
import { BedDouble, CalendarRange, Clock3, Users } from 'lucide-react';

const FEATURES = [
    { icon: CalendarRange, title: 'Giorno per giorno', text: 'Ogni attività al suo orario, con le idee ancora da piazzare sempre a portata.' },
    { icon: Clock3, title: 'Buchi e giorni pieni', text: 'Tabi ti mostra dove avete tempo libero e dove avete esagerato.' },
    { icon: BedDouble, title: 'Alloggi e prenotazioni', text: 'Notti scoperte e scadenze delle prenotazioni, prima che sia tardi.' },
    { icon: Users, title: 'Insieme agli amici', text: 'Un link e il viaggio è di tutti: ognuno aggiunge le sue idee.' },
];

export default function Welcome() {
    return (
        <div className="min-h-dvh bg-paper text-ink">
            <Head title="Pianifica viaggi insieme" />
            <div className="mx-auto flex max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),3.5rem)] pb-10">
                <p className="text-sm font-extrabold tracking-[0.2em] text-indigo">TABI · 旅</p>
                <h1 className="mt-4 text-[40px] leading-[1.05] font-extrabold tracking-tight">Il viaggio, pianificato insieme.</h1>
                <p className="mt-3 text-base text-mute">Basta itinerari su Word: giorni, alloggi, prenotazioni e idee in un posto solo, condiviso con chi parte con te.</p>

                <div className="mt-7 flex flex-col gap-2.5">
                    <Link href={route('register')} className="flex h-[52px] items-center justify-center rounded-2xl bg-indigo text-[15px] font-extrabold text-white hover:bg-indigo-deep">
                        Crea un account
                    </Link>
                    <Link href={route('login')} className="flex h-[52px] items-center justify-center rounded-2xl border border-line bg-white text-[15px] font-bold hover:bg-[#FAF9F6]">
                        Accedi
                    </Link>
                </div>

                <ul className="mt-10 flex flex-col gap-3">
                    {FEATURES.map(({ icon: Icon, title, text }) => (
                        <li key={title} className="flex gap-3 rounded-[20px] border border-line bg-white p-4">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-soft text-indigo" aria-hidden="true">
                                <Icon className="size-5" />
                            </span>
                            <span>
                                <span className="block text-[15px] font-extrabold">{title}</span>
                                <span className="mt-0.5 block text-sm text-mute">{text}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
