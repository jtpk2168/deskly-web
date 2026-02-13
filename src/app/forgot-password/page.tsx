'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
            });

            if (error) throw error;
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8 bg-white p-8 shadow-sm rounded-xl border border-gray-100">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
                        Reset Password
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Enter your email to receive a reset link
                    </p>
                </div>

                {success ? (
                    <div className="rounded-md bg-green-50 p-4 text-center">
                        <div className="flex justify-center mb-4">
                            <CheckCircle className="h-12 w-12 text-green-500" />
                        </div>
                        <h3 className="text-lg font-medium text-green-800">Check your email</h3>
                        <p className="mt-2 text-sm text-green-700">
                            We've sent a password reset link to <strong>{email}</strong>.
                        </p>
                        <div className="mt-6">
                            <Link href="/login" className="font-medium text-primary hover:text-primary-dark">
                                Return to Login
                            </Link>
                        </div>
                    </div>
                ) : (
                    <form className="mt-8 space-y-6" onSubmit={handleReset}>
                        {error && (
                            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
                                {error}
                            </div>
                        )}
                        <div className="-space-y-px rounded-md shadow-sm">
                            <div>
                                <label htmlFor="email-address" className="sr-only">
                                    Email address
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        id="email-address"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        className="relative block w-full rounded-md border-0 py-1.5 pl-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                                        placeholder="Email address"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative flex w-full justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                            >
                                {loading ? 'Sending...' : 'Send Reset Link'}
                            </button>
                        </div>

                        <div className="flex justify-center">
                            <Link href="/login" className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Login
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
