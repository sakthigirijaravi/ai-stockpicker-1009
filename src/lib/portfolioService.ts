import { supabase } from './supabase';

export interface PortfolioConstituent {
  id: number;
  user_id?: string;
  quarter: string;
  stock_name: string;
  stock_code: string;
  company_logo_url: string | null;
  weight: number;
  quarterly_returns: number;
  created_at: string;
  updated_at: string;
}

export interface PortfolioSummary {
  quarter: string;
  total_stocks: number;
  avg_returns: number;
  total_weight: number;
  top_performer: string;
  top_performer_return: number;
}

export interface QuarterSummary {
  quarter: string;
  total_stocks: number;
  avg_returns: number;
  total_weight: number;
}

class PortfolioService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private connectionStatus = { isConnected: true, retryCount: 0 };

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('user_profiles').select('count').limit(1);
      this.connectionStatus.isConnected = !error;
      if (!error) {
        this.connectionStatus.retryCount = 0;
      }
      return !error;
    } catch (error) {
      console.error('Connection test failed:', error);
      this.connectionStatus.isConnected = false;
      this.connectionStatus.retryCount++;
      return false;
    }
  }

  /**
   * Get cached data or fetch fresh data
   */
  private async getCachedOrFetch<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    forceFresh = false,
    fallbackData?: T
  ): Promise<T> {
    // Test connection before attempting fetch
    const isConnected = await this.testConnection();
    if (!isConnected && fallbackData !== undefined) {
      console.warn('Using fallback data due to connection issues');
      return fallbackData;
    }

    if (!forceFresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }
    }

    try {
      const data = await fetchFn();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      this.connectionStatus.retryCount = 0;
      return data;
    } catch (error) {
      console.error('Fetch function failed:', error);
      this.connectionStatus.retryCount++;
      
      // Try cached data as fallback
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.warn('Using cached data due to fetch failure');
        return cached.data;
      }
      
      // Use fallback data if available
      if (fallbackData !== undefined) {
        console.warn('Using fallback data due to fetch failure');
        return fallbackData;
      }
      
      throw error;
    }
  }

  /**
   * Get all portfolio constituents for a specific quarter
   */
  async getPortfolioByQuarter(quarter: string, userId?: string): Promise<PortfolioConstituent[]> {
    const cacheKey = `portfolio_${quarter}_${userId || 'public'}`;
    
    // Import fallback data
    const { mockPortfolioData } = await import('../data/mockPortfolioData');
    
    return this.getCachedOrFetch(cacheKey, async () => {
      try {
        let query = supabase
          .from('portfolio_constituents')
          .select('*')
          .eq('quarter', quarter)
          .order('weight', { ascending: false });

        if (userId) {
          query = query.eq('user_id', userId);
        } else {
          query = query.is('user_id', null);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Database query error:', error);
          throw error;
        }

        // If no data found, return mock data for demo
        if (!data || data.length === 0) {
          console.log('No database data found, using mock data');
          return mockPortfolioData.filter(item => item.quarter === quarter);
        }

        return data;
      } catch (error) {
        console.error('Error in getPortfolioByQuarter:', error);
        throw error;
      }
    }, false, mockPortfolioData.filter(item => item.quarter === quarter));
  }

  /**
   * Get all available quarters with summary data
   */
  async getQuartersSummary(userId?: string): Promise<QuarterSummary[]> {
    const cacheKey = `quarters_${userId || 'public'}`;
    
    // Import fallback data
    const { mockQuartersSummary } = await import('../data/mockPortfolioData');
    
    return this.getCachedOrFetch(cacheKey, async () => {
      try {
        let query = supabase
          .from('portfolio_constituents')
          .select('quarter, weight, quarterly_returns')
          .order('quarter', { ascending: false });

        if (userId) {
          query = query.eq('user_id', userId);
        } else {
          query = query.is('user_id', null);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Database query error:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          console.log('No quarters data found, using mock data');
          return mockQuartersSummary;
        }

        // Group by quarter and calculate summaries
        const quarterMap = new Map<string, {
          total_stocks: number;
          total_returns: number;
          total_weight: number;
        }>();

        data.forEach(item => {
          const existing = quarterMap.get(item.quarter) || {
            total_stocks: 0,
            total_returns: 0,
            total_weight: 0
          };

          quarterMap.set(item.quarter, {
            total_stocks: existing.total_stocks + 1,
            total_returns: existing.total_returns + item.quarterly_returns,
            total_weight: existing.total_weight + item.weight
          });
        });

        const summaries = Array.from(quarterMap.entries()).map(([quarter, summary]) => ({
          quarter,
          total_stocks: summary.total_stocks,
          avg_returns: summary.total_returns / summary.total_stocks,
          total_weight: summary.total_weight
        }));
        
        return summaries;
      } catch (error) {
        console.error('Error in getQuartersSummary:', error);
        throw error;
      }
    }, false, mockQuartersSummary);
  }

  /**
   * Clear cache for specific keys or all cache
   */
  clearCache(pattern?: string): void {
    try {
      if (pattern) {
        const keysToDelete = Array.from(this.cache.keys()).filter(key => key.includes(pattern));
        keysToDelete.forEach(key => this.cache.delete(key));
      } else {
        this.cache.clear();
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): { isConnected: boolean; retryCount: number } {
    return this.connectionStatus;
  }

  /**
   * Force connection test
   */
  async forceConnectionTest(): Promise<boolean> {
    return await this.testConnection();
  }
}

// Export singleton instance
export const portfolioService = new PortfolioService();