export default function ReelsManager() {
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-text-light">Reels Management</h1>
                <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors">
                    Upload New Reel
                </button>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-subtext-light">
                <p>No reels uploaded yet.</p>
            </div>
        </div>
    );
}
