import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SessionStorageService {
  get(key: string): string {
    return sessionStorage.getItem(key) ?? '';
  }

  set(key: string, value: string): void {
    sessionStorage.setItem(key, value);
  }
}
