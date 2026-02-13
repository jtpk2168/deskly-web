import { Users, Package, ShoppingCart, DollarSign } from 'lucide-react';

export default function AdminDashboard() {
    return (
        <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Total Revenue"
                    value="RM 0.00"
                    icon={DollarSign}
                />
                <StatsCard
                    title="Active Rentals"
                    value="0"
                    icon={ShoppingCart}
                />
                <StatsCard
                    title="Total Products"
                    value="0"
                    icon={Package}
                />
                <StatsCard
                    title="Total Users"
                    value="0"
                    icon={Users}
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-lg font-medium text-text-light mb-4">Recent Activity</h3>
                    <div className="text-center py-10 text-subtext-light">
                        No recent activity
                    </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-lg font-medium text-text-light mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                        <button className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors">
                            Add New Product
                        </button>
                        <button className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-text-light hover:bg-gray-50 transition-colors">
                            View Pending Orders
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatsCard({ title, value, icon: Icon }: { title: string, value: string, icon: any }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-subtext-light">{title}</p>
                    <p className="mt-2 text-3xl font-bold text-text-light">{value}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                </div>
            </div>
        </div>
    );
}
