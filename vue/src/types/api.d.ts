declare module '@/api/login.js' {
  export function login(data: any): Promise<any>;
  export function mockLogin(data: any): Promise<any>;
}