export default function ReelsManager() {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Reels Management</h1>
                <button style={{ padding: '10px 20px', backgroundColor: '#18181b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    Upload New Reel
                </button>
            </div>

            <div style={{ padding: '40px', textAlign: 'center', border: '1px dashed #e4e4e7', borderRadius: '8px', color: '#71717a' }}>
                <p>No reels uploaded yet.</p>
            </div>
        </div>
    );
}
