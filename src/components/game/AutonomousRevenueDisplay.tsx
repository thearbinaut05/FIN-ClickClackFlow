import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import { LovableCloudService } from '@/services/LovableCloudService';

interface AutonomousRevenueDisplayProps {
  className?: string;
}

const AutonomousRevenueDisplay: React.FC<AutonomousRevenueDisplayProps> = ({ className }) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lovableCloud = LovableCloudService.getInstance();

  const fetchBalance = async () => {
    try {
      // Legacy balance source is intentionally disabled until provider verification exists.
      const revenueBalance = await lovableCloud.getRevenueBalance('');
      setBalance(revenueBalance);
      setError(null);
      setLastUpdate(new Date());
    } catch (error) {
      setBalance(null);
      setError('No verified payment integration is connected. Balance unavailable.');
      console.error('Error fetching verified revenue balance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchBalance();
    
    // Update every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-green-500" />
          Verified Revenue Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Provider-verified Balance</p>
            <p className="text-2xl font-bold text-green-600">
              {isLoading ? 'Checking…' : balance === null ? 'Unavailable' : formatCurrency(balance)}
            </p>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {error ? 'Not connected' : isLoading ? 'Checking' : 'Not payout confirmation'}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last Updated
          </div>
          <span>{formatTime(lastUpdate)}</span>
        </div>
        
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {error || 'A balance does not prove bank settlement. A provider-confirmed payout and bank reconciliation are required.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutonomousRevenueDisplay;