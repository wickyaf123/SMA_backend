import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { RealiePropertyResponse, RealieProperty } from './types';

export class RealieClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.realie.baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': config.realie.apiKey || '',
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (res) => res,
      (error) => {
        const status = error.response?.status;
        const msg = error.response?.data?.error || error.message;
        logger.error({ status, msg, url: error.config?.url }, 'Realie API error');
        throw error;
      }
    );
  }

  async lookupByAddress(params: {
    state: string;
    address: string;
    city?: string;
    county?: string;
  }): Promise<RealieProperty | null> {
    try {
      const response = await this.client.get<RealiePropertyResponse>(
        '/public/property/address/',
        { params }
      );
      return response.data.property || null;
    } catch (err: any) {
      if (err.response?.status === 404) {
        logger.info({ address: params.address, state: params.state }, 'Realie: address not found');
        return null;
      }
      logger.warn({ address: params.address, error: err.message }, 'Realie address lookup failed');
      return null;
    }
  }

  async searchByOwner(params: {
    state: string;
    lastName: string;
    firstName?: string;
    limit?: number;
    offset?: number;
  }): Promise<RealieProperty[]> {
    try {
      const response = await this.client.get<{ properties: RealieProperty[]; metadata: any }>(
        '/public/property/owner/',
        { params: { ...params, limit: params.limit || 10 } }
      );
      return response.data.properties || [];
    } catch (err: any) {
      if (err.response?.status === 404) {
        return [];
      }
      logger.warn({ lastName: params.lastName, error: err.message }, 'Realie owner search failed');
      return [];
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/public/property/address/', {
        params: { state: 'TX', address: '1' },
        timeout: 10000,
      });
      return true;
    } catch (err: any) {
      if (err.response?.status === 400 || err.response?.status === 404) {
        return true; // API is reachable
      }
      return false;
    }
  }
}

export const realieClient = new RealieClient();
