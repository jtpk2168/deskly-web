import Link from 'next/link';
import styles from './admin.module.css';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className={styles.container}>
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>Deskly Admin</div>
                <nav className={styles.nav}>
                    <Link href="/admin" className={styles.navLink}>Dashboard</Link>
                    <Link href="/admin/reels" className={styles.navLink}>Reels</Link>
                    <Link href="/admin/products" className={styles.navLink}>Products</Link>
                    <Link href="/admin/bundles" className={styles.navLink}>Bundles</Link>
                </nav>
            </aside>
            <main className={styles.main}>
                {children}
            </main>
        </div>
    );
}
