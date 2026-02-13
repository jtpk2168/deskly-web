export default function AdminDashboard() {
    return (
        <div>
            <h1 style={{ marginBottom: '20px', fontSize: '2rem', fontWeight: 'bold' }}>Dashboard</h1>
            <p>Welcome to the Deskly Admin Portal.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
                <div style={{ padding: '20px', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                    <h3>Users</h3>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0</p>
                </div>
                <div style={{ padding: '20px', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                    <h3>Available Reels</h3>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0</p>
                </div>
                <div style={{ padding: '20px', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                    <h3>New Orders</h3>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0</p>
                </div>
            </div>
        </div>
    );
}
