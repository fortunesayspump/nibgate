import Link from 'next/link';
import { UserAuthForm } from '../UserAuthForm';

export const metadata = {
  title: 'Nibgate Platform | Register',
};

export default function Page() {
  return (
    <>
      <h1 className="mb-3 font-display text-3xl font-bold text-slate-950">Create account</h1>
      <p className="mb-5 text-sm leading-6 text-slate-500">Start a publisher profile for your media and posts.</p>
      <UserAuthForm mode="register" />
      <p className="mt-5 text-sm text-slate-500">Already have an account?</p>
      <p className="cursor-pointer text-sm font-semibold text-emerald-700 hover:text-emerald-800">
        <Link href="/login" prefetch>
          Login
        </Link>
      </p>
    </>
  );
}
