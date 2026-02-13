

export const users = [
    {
        id: 'USR-001',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'Admin',
        joinedDate: '2023-01-15',
    },
    {
        id: 'USR-002',
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'Customer',
        joinedDate: '2023-02-20',
    },
    {
        id: 'USR-003',
        name: 'Mike Johnson',
        email: 'mike@example.com',
        role: 'Customer',
        joinedDate: '2023-03-10',
    },
];

export const orders = [
    {
        id: 'ORD-001',
        customer: 'Alice Johnson',
        items: 'Ergonomic Office Chair',
        total: 350.00,
        status: 'Pending',
        date: '2023-10-25',
    },
    {
        id: 'ORD-002',
        customer: 'Bob Smith',
        items: 'Standing Desk, Monitor Arm',
        total: 1350.00,
        status: 'Delivered',
        date: '2023-10-24',
    },
    {
        id: 'ORD-003',
        customer: 'Charlie Brown',
        items: 'Ergonomic Office Chair',
        total: 350.00,
        status: 'Cancelled',
        date: '2023-10-23',
    },
    {
        id: 'ORD-004',
        customer: 'David Lee',
        items: 'Monitor Arm',
        total: 150.00,
        status: 'Processing',
        date: '2023-10-22',
    },
];

export const products = [
    {
        id: '1',
        name: 'Ergonomic Office Chair',
        category: 'Chairs',
        price: 350.00,
        stock: 12,
        status: 'In Stock',
        image: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&q=80&w=1000',
    },
    {
        id: '2',
        name: 'Standing Desk',
        category: 'Desks',
        price: 1200.00,
        stock: 5,
        status: 'Low Stock',
        image: 'https://images.unsplash.com/photo-1595515106967-1438a221f736?auto=format&fit=crop&q=80&w=1000',
    },
    {
        id: '3',
        name: 'Monitor Arm',
        category: 'Accessories',
        price: 150.00,
        stock: 0,
        status: 'Out of Stock',
        image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&q=80&w=1000',
    },
];
