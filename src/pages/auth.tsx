import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { paths } from '@/lib/paths';
import { errorMessage, supabase } from '@/lib/supabase';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
    useEffect(() => {
        document.title = `${title} · Tabi`;
    }, [title]);

    return (
        <div className="min-h-dvh bg-paper text-ink">
            <main className="mx-auto flex max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),3.5rem)] pb-10">
                <Link to={paths.home()} className="text-sm font-extrabold tracking-[0.2em] text-indigo">
                    TABI · 旅
                </Link>
                <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{title}</h1>
                <p className="mt-1 text-sm text-mute">{subtitle}</p>
                <div className="mt-6">{children}</div>
                <p className="mt-6 text-center text-sm text-mute">{footer}</p>
            </main>
        </div>
    );
}

export function LoginPage() {
    const next = useSearchParams()[0].get('next') ?? undefined;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setPending(true);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        setPending(false);
        if (error) setError(errorMessage(error));
        // on success GuestOnly redirects to `next`
    };

    return (
        <AuthShell
            title="Bentornato"
            subtitle={next?.startsWith('/join/') ? 'Accedi per unirti al viaggio a cui ti hanno invitato.' : 'Accedi per vedere i tuoi viaggi.'}
            footer={
                <>
                    Non hai un account?{' '}
                    <Link to={paths.register(next)} className="font-bold text-indigo hover:underline">
                        Registrati
                    </Link>
                </>
            }
        >
            <form onSubmit={submit} className="flex flex-col gap-4">
                <FormError message={error} />
                <Field label="Email" htmlFor="email">
                    <input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </Field>
                <Field label="Password" htmlFor="password">
                    <input id="password" type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </Field>
                <PrimaryButton type="submit" disabled={pending} className="mt-2">
                    Accedi
                </PrimaryButton>
            </form>
        </AuthShell>
    );
}

export function RegisterPage() {
    const next = useSearchParams()[0].get('next') ?? undefined;
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [checkEmail, setCheckEmail] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setPending(true);
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}${next ?? paths.trips()}` },
        });
        setPending(false);
        if (error) return setError(errorMessage(error));
        // with email confirmation on, there is no session until the link is clicked
        if (!data.session) setCheckEmail(true);
    };

    if (checkEmail) {
        return (
            <AuthShell title="Controlla la posta" subtitle={`Ti abbiamo mandato un link a ${email}: aprilo per attivare l'account.`} footer={<Link to={paths.login(next)} className="font-bold text-indigo hover:underline">Torna all'accesso</Link>}>
                <span />
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title="Crea un account"
            subtitle="Ti serve per pianificare e condividere i viaggi."
            footer={
                <>
                    Hai già un account?{' '}
                    <Link to={paths.login(next)} className="font-bold text-indigo hover:underline">
                        Accedi
                    </Link>
                </>
            }
        >
            <form onSubmit={submit} className="flex flex-col gap-4">
                <FormError message={error} />
                <Field label="Nome (lo vedranno i tuoi amici)" htmlFor="name">
                    <input id="name" autoComplete="given-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
                </Field>
                <Field label="Email" htmlFor="email">
                    <input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
                </Field>
                <Field label="Password" htmlFor="password">
                    <input id="password" type="password" autoComplete="new-password" minLength={6} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </Field>
                <PrimaryButton type="submit" disabled={pending} className="mt-2">
                    Crea account
                </PrimaryButton>
            </form>
        </AuthShell>
    );
}
