export async function saveTemplates(data: any) {
    const key = process.env.NEXT_PUBLIC_ADMIN_KEY || process.env.ADMIN_KEY;
    return fetch("/api/admin/templates", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": key || "my_secret_admin_key_123",
      },
      body: JSON.stringify(data),
    });
  }
  
  export async function saveModels(data: any) {
    const key = process.env.NEXT_PUBLIC_ADMIN_KEY || process.env.ADMIN_KEY;
    return fetch("/api/admin/models", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": key || "my_secret_admin_key_123",
      },
      body: JSON.stringify(data),
    });
  }