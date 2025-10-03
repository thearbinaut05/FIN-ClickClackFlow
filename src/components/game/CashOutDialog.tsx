import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BadgeDollarSign, ArrowRight, Loader2, CreditCard, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useGame } from '@/contexts/GameContext';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CASHOUT_METHODS } from '@/utils/constants';
import { CashoutService } from '@/services/CashoutService';
import { addOfflineTransaction } from './OfflinePaymentHandler';
import TestCashOutButton from './TestCashOutButton';

interface CashOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Form validation schema using zod
const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  method: z.enum([CASHOUT_METHODS.STANDARD, CASHOUT_METHODS.VIRTUAL_CARD, CASHOUT_METHODS.BANK_CARD], {
    required_error: "Please select a payment method",
  }),
});

type CashOutFormValues = z.infer<typeof formSchema>;

const CashOutDialog: React.FC<CashOutDialogProps> = ({ open, onOpenChange }) => {
  const { coins, cashOut } = useGame();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Calculate the cash value (100 coins = $1)
  const cashValue = (coins / 100).toFixed(2);
  
  // Minimum cash out amount is $1 (100 coins)
  const form = useForm<CashOutFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      method: CASHOUT_METHODS.STANDARD
    }
  });

  // Reset form state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  const canCashOut = coins >= 100;

  const handleCashOut = async (values: CashOutFormValues) => {
    if (!canCashOut) {
      toast({
        title: "Error",
        description: "You need at least 100 coins to cash out",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    
    try {
      console.log("Attempting cashout:", { 
        amount: cashValue, 
        email: values.email,
        method: values.method 
      });
      
      // Map frontend method to backend payout type
      let payoutType;
      switch (values.method) {
        case CASHOUT_METHODS.VIRTUAL_CARD:
          payoutType = 'instant_card';
          break;
        case CASHOUT_METHODS.BANK_CARD:
          payoutType = 'bank_account';
          break;
        default:
          payoutType = 'email';
      }
      
      // Use REAL Supabase edge function for cashout
      const { supabase } = await import('@/integrations/supabase/client');
      
      console.log('🚀 Calling real cashout edge function...');
      
      const { data, error } = await supabase.functions.invoke('cashout', {
        body: {
          userId: `user_${Date.now()}`,
          coins: coins,
          payoutType: payoutType,
          email: values.email,
          metadata: {
            gameSession: Date.now(),
            coinCount: coins,
            realMoney: true
          }
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }
      
      console.log('✅ Cashout response:', data);
      const result = { success: true, ...data };
      
      if (!result.success) {
        // If main service fails, queue for offline processing
        if (!navigator.onLine || result.error?.includes('database quota')) {
          addOfflineTransaction({
            amount: parseFloat(cashValue),
            email: values.email,
            method: payoutType
          });
          
          setSuccess(`Payment queued for processing: $${cashValue} to ${values.email}`);
          toast({
            title: "Payment Queued",
            description: "Payment will be processed when service is available",
            variant: "default",
          });
          return;
        }
        
        throw new Error(result.error || 'Payment processing failed');
      }
      
      console.log("Cashout result:", result);
      
      // Reset coins in game context
      await cashOut(values.email);
      
      let successMessage = `You've successfully cashed out $${cashValue} to ${values.email}!`;
      
      if (values.method === CASHOUT_METHODS.VIRTUAL_CARD) {
        const cardDetails = result.details as any;
        successMessage = `Virtual card created with ${cardDetails?.cardDetails?.last4 ? 'ending in ' + cardDetails.cardDetails.last4 : ''}! Details sent to ${values.email}`;
      } else if (values.method === CASHOUT_METHODS.BANK_CARD) {
        successMessage = `$${cashValue} will be transferred to your bank card. Details sent to ${values.email}`;
      }
      
      // Add source information to the message
      if (result.isReal && result.source === 'cashout_server') {
        successMessage += ' 💰 REAL PAYMENT PROCESSED';
      } else {
        successMessage += ' (Demo Mode - Processed locally)';
      }
      
      setSuccess(successMessage);
      
      toast({
        title: result.isReal ? "💰 Real Payment Processed" : "Payment Processed (Demo)",
        description: successMessage,
      });
    } catch (error) {
      console.error("Cashout error:", error);
      const errorMessage = error instanceof Error ? error.message : "Server error. Please try again later.";
      setError(errorMessage);
      
      toast({
        title: "Payment Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#151b2a] border border-white/20 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-game-green" />
            Cash Out Real Money
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Convert your coins to real cash
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="mb-4 p-4 rounded-lg bg-black/30 border border-white/10">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400">Your coins:</span>
              <span className="text-xl font-bold">{coins}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Cash value:</span>
              <div className="flex items-center">
                <span className="text-game-green font-bold text-lg">${cashValue}</span>
                <span className="text-xs text-gray-500 ml-2">(100 coins = $1)</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between mb-4">
            <div>
              {coins < 100 && (
                <div className="p-2 bg-orange-900/40 text-orange-300 rounded-md text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  You need at least 100 coins to cash out
                </div>
              )}
            </div>
            <TestCashOutButton />
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-600/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-600/30 rounded-lg flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-300">{success}</p>
            </div>
          )}
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCashOut)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-white">Email Address</FormLabel>
                    <FormControl>
                      <Input 
                        className="bg-black/30 border-white/20 text-white focus:border-game-green" 
                        placeholder="email@example.com"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-gray-400">
                      We'll send payment confirmation to this email
                    </p>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-white">Payment Method</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0 rounded-md p-3 bg-black/20 border border-white/10">
                          <FormControl>
                            <RadioGroupItem value={CASHOUT_METHODS.STANDARD} />
                          </FormControl>
                          <FormLabel className="font-normal flex items-center gap-2">
                            <BadgeDollarSign className="h-4 w-4" />
                            <div>
                              <div className="text-sm">Standard Payment</div>
                              <div className="text-xs text-gray-400">Payment sent to your email</div>
                            </div>
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0 rounded-md p-3 bg-black/20 border border-white/10">
                          <FormControl>
                            <RadioGroupItem value={CASHOUT_METHODS.VIRTUAL_CARD} />
                          </FormControl>
                          <FormLabel className="font-normal flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            <div>
                              <div className="text-sm">Virtual Card</div>
                              <div className="text-xs text-gray-400">Create a virtual card with this balance</div>
                            </div>
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0 rounded-md p-3 bg-black/20 border border-white/10">
                          <FormControl>
                            <RadioGroupItem value={CASHOUT_METHODS.BANK_CARD} />
                          </FormControl>
                          <FormLabel className="font-normal flex items-center gap-2">
                            <Wallet className="h-4 w-4" />
                            <div>
                              <div className="text-sm">Bank Card</div>
                              <div className="text-xs text-gray-400">Transfer to your bank card</div>
                            </div>
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
          
              <div className="mb-4 p-3 bg-green-900/20 border border-green-600/30 rounded-lg mt-4">
                <p className="text-sm text-green-300">
                  Your payment will be processed according to your selected method
                </p>
              </div>
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!canCashOut || isProcessing}
                  className="bg-game-green hover:bg-game-green/80 text-black font-bold"
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      Cash Out <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashOutDialog;

