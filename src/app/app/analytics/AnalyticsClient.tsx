'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, FunnelChart, Funnel,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

export function AnalyticsClient({
  revenueSeries, funnel, aging, acceptanceRate, currency, locale,
}: {
  revenueSeries: { month: string; revenue: number }[];
  funnel: { stage: string; count: number }[];
  aging: { band: string; amount: number }[];
  acceptanceRate: number;
  currency: string;
  locale: string;
}) {
  const tooltipStyle = {
    background: '#1c1c28', border: '1px solid #2a2a3a', borderRadius: 8, color: '#f4f4f8', fontSize: 12,
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Total revenue (12mo)" value={formatCurrency(revenueSeries.reduce((t, r) => t + r.revenue, 0), currency, locale)} accent="#10b981" />
        <Kpi label="Open receivables" value={formatCurrency(aging.reduce((t, r) => t + r.amount, 0), currency, locale)} accent="#f59e0b" />
        <Kpi label="Acceptance rate (90d)" value={`${acceptanceRate}%`} accent="#8b5cf6" />
        <Kpi label="Pipeline volume" value={`${funnel[0]?.count ?? 0} props`} accent="#ec4899" />
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Revenue, last 12 months</h2>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={revenueSeries}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#8a8aa0" fontSize={12} />
              <YAxis stroke="#8a8aa0" fontSize={12} tickFormatter={(v) => `₹${Math.round(v / 100000)}L`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v, currency, locale)} />
              <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Proposal funnel</h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={funnel}>
                <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
                <XAxis dataKey="stage" stroke="#8a8aa0" fontSize={12} />
                <YAxis stroke="#8a8aa0" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#ec4899" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-4">Receivables aging</h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={aging}>
                <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
                <XAxis dataKey="band" stroke="#8a8aa0" fontSize={12} />
                <YAxis stroke="#8a8aa0" fontSize={12} tickFormatter={(v) => `₹${Math.round(v / 100000)}L`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v, currency, locale)} />
                <Bar dataKey="amount" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />
      <div className="relative">
        <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </div>
    </div>
  );
}
