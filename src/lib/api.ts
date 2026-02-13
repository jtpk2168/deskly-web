export async function fetchAdminData(endpoint: string) {
    try {
        const res = await fetch(`/api/${endpoint}`, { cache: 'no-store' }); // Ensure fresh data
        if (!res.ok) {
            throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
        }
        const json = await res.json();
        return json.data || json; // Handle wrapped vs unwrapped responses
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return [];
    }
}

// Products
export async function getProducts() {
    return fetchAdminData('products');
}

export async function createProduct(productData: any) {
    const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(productData),
    });
    if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to create product. Server response:', errorText);
        throw new Error(`Failed to create product: ${errorText}`);
    }
    return res.json();
}


// Orders (Subscriptions)
export async function getOrders() {
    return fetchAdminData('orders');
}

// Admins
export async function getAdmins() {
    return fetchAdminData('admins');
}

export async function deleteAdmin(userId: string) {
    const res = await fetch(`/api/admins?id=${userId}`, { method: 'DELETE' });
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to delete admin');
    }
    return res.json();
}

// Customers
export async function getCustomers() {
    return fetchAdminData('customers');
}

export async function deleteCustomer(userId: string) {
    const res = await fetch(`/api/customers?id=${userId}`, { method: 'DELETE' });
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to delete customer');
    }
    return res.json();
}
