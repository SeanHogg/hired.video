import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, AlertCircle, DollarSign, Calendar, CreditCard } from 'lucide-react';
import { refundService, CreateRefundRequest, RefundPolicy, RefundReasons } from '../../lib/services/refund-service';
import { toast } from 'sonner';

interface RefundRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  subscriptionId?: string;
  chargeId?: string;
  defaultAmount?: number;
}

export function RefundRequestModal({
  isOpen,
  onClose,
  onSuccess,
  subscriptionId,
  chargeId,
  defaultAmount,
}: RefundRequestModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<RefundPolicy | null>(null);
  const [reasons, setReasons] = useState<RefundReasons | null>(null);

  const [formData, setFormData] = useState<CreateRefundRequest>({
    subscriptionId: subscriptionId || '',
    stripeChargeId: chargeId || '',
    amountCents: defaultAmount || 0,
    reason: '',
    description: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    setIsLoadingData(true);
    setError(null);

    try {
      const [policyResponse, reasonsResponse] = await Promise.all([
        refundService.getRefundPolicy(),
        refundService.getRefundReasons(),
      ]);

      if (policyResponse.success) {
        setPolicy(policyResponse.data);
      }

      if (reasonsResponse.success) {
        setReasons(reasonsResponse.data);
      }
    } catch (err) {
      console.error('Error loading refund data:', err);
      setError('Failed to load refund information. Please try again.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validate form data
      if (!formData.reason) {
        throw new Error('Please select a reason for the refund');
      }

      if (formData.amountCents <= 0) {
        throw new Error('Please enter a valid refund amount');
      }

      const response = await refundService.createRefundRequest(formData);

      if (response.success) {
        toast.success('Refund request submitted successfully');
        onSuccess?.();
        onClose();
        resetForm();
      } else {
        throw new Error(response.error?.message || 'Failed to submit refund request');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      subscriptionId: subscriptionId || '',
      stripeChargeId: chargeId || '',
      amountCents: defaultAmount || 0,
      reason: '',
      description: '',
    });
    setError(null);
  };

  const handleClose = () => {
    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  const formatAmount = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (isLoadingData) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading refund information...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Request Refund
          </DialogTitle>
        </DialogHeader>

        {/* Refund Policy Information */}
        {policy && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Refund Policy</p>
                <p className="text-sm">{policy.policyText}</p>
                <p className="text-xs text-muted-foreground">
                  Refunds are available for {policy.refundPeriodDays} days from purchase.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Refund Amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={(formData.amountCents / 100).toFixed(2)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    amountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                  })
                }
                className="pl-10"
                placeholder="0.00"
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the amount you would like refunded
            </p>
          </div>

          {/* Subscription/Charge Information */}
          {(subscriptionId || chargeId) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subscriptionId && (
                <div className="space-y-2">
                  <Label>Subscription ID</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono">{subscriptionId}</span>
                  </div>
                </div>
              )}
              {chargeId && (
                <div className="space-y-2">
                  <Label>Charge ID</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono">{chargeId}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Refund *</Label>
            <Select
              value={formData.reason}
              onValueChange={(value) => setFormData({ ...formData, reason: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {reasons?.reasons.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    <div>
                      <div className="font-medium">{reason.label}</div>
                      {reason.description && (
                        <div className="text-sm text-muted-foreground">{reason.description}</div>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Additional Details (Optional)</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Please provide any additional details about your refund request..."
              rows={4}
              maxLength={1000}
            />
            <p className="text-sm text-muted-foreground">
              {(formData.description?.length || 0)}/1000 characters
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Refund Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
