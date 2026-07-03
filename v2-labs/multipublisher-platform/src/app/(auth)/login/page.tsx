import Link from 'next/link';
import { UserAuthForm } from '../UserAuthForm';

export const metadata = {
  title: 'Nibgate Platform | Login',
};

export default function Page() {
  return (
    <>
      <h1 className="mb-3 font-display text-3xl font-bold text-slate-950">Log in</h1>
      <p className="mb-5 text-sm leading-6 text-slate-500">Enter your email to access your creator profile.</p>
      <UserAuthForm mode="login" />
      <p className="mt-5 text-sm text-slate-500">No account yet?</p>
      <p className="cursor-pointer text-sm font-semibold text-emerald-700 hover:text-emerald-800">
        <Link href="/register" prefetch>
          Create an account
        </Link>
      </p>
    </>
  );
}
