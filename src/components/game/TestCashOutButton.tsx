
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { TestTube, BarChart3 } from 'lucide-react';
import { useGame } from '@/contexts/GameContext';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_TEST_EMAIL, DEFAULT_CASHOUT_METHOD } from '@/utils/constants';
import { CashoutService } from '@/services/CashoutService';
import AdMonetizationService from '@/services/AdMonetizationService';

const TestCashOutButton: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMonetizationTest, setIsMonetizationTest] = useState(false);
  const { coins } = useGame();
  
  const handleTestCashOut = async () => {
    setIsProcessing(true);
    
    try {
      // Calculate the cash value (100 coins = $1)
      const cashValue = Math.max(1, coins / 100).toFixed(2);
      
      console.log("Testing automated cashout system:", { 
        coins: coins,
        email: DEFAULT_TEST_EMAIL,
        method: DEFAULT_CASHOUT_METHOD 
      });
      
      // Use the CashoutService with fallback logic
      const cashoutService = CashoutService.getInstance();
      const result = await cashoutService.processCashout({
        userId: `test_${Date.now()}`,
        coins: Math.max(100, coins),
        payoutType: DEFAULT_CASHOUT_METHOD,
        email: DEFAULT_TEST_EMAIL,
        metadata: {
          gameSession: Date.now(),
          coinCount: coins,
          testRun: true
        }
      });
      
      if (result.success) {
        console.log("Test cashout result:", result);
        
        // Determine source message based on payment type
        let sourceMessage = 'via Local Storage (Demo Mode)';
        let titlePrefix = '✅';
        
        if (result.isReal && result.source === 'cashout_server') {
          sourceMessage = 'via Real Payment Server (REAL MONEY)';
          titlePrefix = '💰';
        } else if (result.source === 'demo_mode') {
          sourceMessage = 'via Local Storage (Demo Mode)';
        }
        
        toast({
          title: `${titlePrefix} System Test Successful`,
          description: `Cashout system working ${sourceMessage}! Transaction ID: ${result.transaction_id || result.details?.id || result.details?.paymentIntentId || 'n/a'}`,
        });
      } else {
        throw new Error(result.error || 'Cashout test failed');
      }
    } catch (error) {
      console.error("Test cashout error:", error);
      toast({
        title: "❌ System Test Failed",
        description: error instanceof Error ? error.message : "Connection to cashout system failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleTestMonetization = async () => {
    setIsMonetizationTest(true);
    
    try {
      const adService = AdMonetizationService.getInstance();
      
      // Test impression tracking
      await adService.recordImpression('test');
      
      // Test click tracking
      const ppcEarnings = await adService.recordClick('test');
      
      // Test conversion tracking
      const cpaEarnings = await adService.recordConversion('test');
      
      // Test optimization
      const optimization = await adService.optimizeAdStrategy();
      
      toast({
        title: "✅ Monetization System Test",
        description: `PPC: $${ppcEarnings.toFixed(2)}, CPA: $${cpaEarnings.toFixed(2)}, Best category: ${optimization.recommendedCategory}`,
      });
    } catch (error) {
      console.error("Monetization test error:", error);
      toast({
        title: "❌ Monetization Test Failed",
        description: error instanceof Error ? error.message : "Error testing monetization system",
        variant: "destructive",
      });
    } finally {
      setIsMonetizationTest(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button 
        onClick={handleTestCashOut}
        disabled={isProcessing}
        className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white flex-1"
        size="sm"
      >
        {isProcessing ? (
          <>Testing...</>
        ) : (
          <>
            <TestTube className="h-4 w-4" />
            Test Cashout
          </>
        )}
      </Button>
      
      <Button 
        onClick={handleTestMonetization}
        disabled={isMonetizationTest}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white flex-1"
        size="sm"
      >
        {isMonetizationTest ? (
          <>Testing...</>
        ) : (
          <>
            <BarChart3 className="h-4 w-4" />
            Test Monetization
          </>
        )}
      </Button>
    </div>
  );
};

export default TestCashOutButton;
