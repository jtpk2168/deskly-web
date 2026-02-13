'use client';

import { Save } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-text-light mb-6">Settings</h1>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h2 className="text-lg font-medium text-text-light mb-4">Platform Configuration</h2>
                <form className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="platformFee" className="block text-sm font-medium text-text-light mb-1">Platform Fee (%)</label>
                            <input
                                type="number"
                                id="platformFee"
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                defaultValue="10"
                            />
                            <p className="mt-1 text-xs text-subtext-light">Percentage taken from each transaction.</p>
                        </div>
                        <div>
                            <label htmlFor="taxRate" className="block text-sm font-medium text-text-light mb-1">Tax Rate (%)</label>
                            <input
                                type="number"
                                id="taxRate"
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                                defaultValue="6"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="deliveryFee" className="block text-sm font-medium text-text-light mb-1">Base Delivery Fee (RM)</label>
                        <input
                            type="number"
                            id="deliveryFee"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/50"
                            defaultValue="15.00"
                        />
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <h3 className="text-sm font-medium text-text-light mb-4">Notification Settings</h3>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="emailNotif" className="rounded border-gray-300 text-primary focus:ring-primary" defaultChecked />
                                <label htmlFor="emailNotif" className="text-sm text-text-light">Email notifications for new orders</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="stockNotif" className="rounded border-gray-300 text-primary focus:ring-primary" defaultChecked />
                                <label htmlFor="stockNotif" className="text-sm text-text-light">Low stock alerts</label>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
                        >
                            <Save className="h-4 w-4" />
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
