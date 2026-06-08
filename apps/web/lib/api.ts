const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface RequestOptions extends RequestInit {
  token?: string;
}

class ApiClient {
  private getAuthHeaders(options: RequestOptions = {}): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    let token = options.token;
    if (!token && typeof window !== 'undefined') {
      token = localStorage.getItem('access_token') || undefined;
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      const errorMsg = data.error || `HTTP error! status: ${response.status}`;
      throw new Error(errorMsg);
    }
    
    return data as T;
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = this.getAuthHeaders(options);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method: 'GET',
      headers: { ...headers, ...options.headers },
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: any, options: RequestOptions = {}): Promise<T> {
    const headers = this.getAuthHeaders(options);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method: 'POST',
      headers: { ...headers, ...options.headers },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body: any, options: RequestOptions = {}): Promise<T> {
    const headers = this.getAuthHeaders(options);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method: 'PUT',
      headers: { ...headers, ...options.headers },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = this.getAuthHeaders(options);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method: 'DELETE',
      headers: { ...headers, ...options.headers },
    });
    return this.handleResponse<T>(response);
  }
}

export const api = new ApiClient();
export default api;
