'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PaymentInstructionView } from './PaymentInstructionView';

export const PaymentInstructionPage: React.FC = () => {
  const searchParams = useSearchParams();
  const [localData, setLocalData] = useState<any>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ku_pending_signup');
      if (stored) {
        setLocalData(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const orderNumber =
    searchParams.get('order') ||
    searchParams.get('order_number') ||
    localData?.orderNumber ||
    'KU-260923-0182';

  const travelName =
    searchParams.get('travel_name') ||
    searchParams.get('travel') ||
    localData?.travelName ||
    'Al-Barakah Tour & Travel';

  const slug =
    searchParams.get('slug') ||
    localData?.slug ||
    'albarakah.klikumroh.id';

  const planName =
    searchParams.get('plan') ||
    searchParams.get('plan_name') ||
    localData?.planName ||
    '6 Bulan';

  const rawAmount =
    searchParams.get('amount') ||
    searchParams.get('final_amount') ||
    (localData?.finalAmount ? String(localData.finalAmount) : null);
  const finalAmount = rawAmount ? parseInt(rawAmount, 10) || 2700000 : 2700000;

  const rawBaseAmount =
    searchParams.get('base_amount') ||
    (localData?.baseAmount ? String(localData.baseAmount) : null);
  const baseAmount = rawBaseAmount ? parseInt(rawBaseAmount, 10) : undefined;

  const rawDiscountAmount =
    searchParams.get('discount_amount') ||
    (localData?.discountAmount ? String(localData.discountAmount) : null);
  const discountAmount = rawDiscountAmount ? parseInt(rawDiscountAmount, 10) : undefined;

  const rawUniqueCode =
    searchParams.get('unique_code') ||
    (localData?.uniqueCode !== undefined ? String(localData.uniqueCode) : null);
  const uniqueCode = rawUniqueCode ? parseInt(rawUniqueCode, 10) : undefined;

  const rawVerificationId =
    searchParams.get('verification_id') ||
    (localData?.verificationId ? String(localData.verificationId) : null);
  const verificationId = rawVerificationId
    ? parseInt(rawVerificationId, 10)
    : undefined;

  const adminEmail =
    searchParams.get('email') ||
    localData?.adminEmail ||
    undefined;

  const adminWhatsApp =
    searchParams.get('whatsapp') ||
    localData?.adminWhatsApp ||
    undefined;

  return (
    <PaymentInstructionView
      orderNumber={orderNumber}
      travelName={travelName}
      slug={slug}
      planName={planName}
      baseAmount={baseAmount}
      discountAmount={discountAmount}
      uniqueCode={uniqueCode}
      finalAmount={finalAmount}
      verificationId={verificationId}
      adminEmail={adminEmail}
      adminWhatsApp={adminWhatsApp}
    />
  );
};
