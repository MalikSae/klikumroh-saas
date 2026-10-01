// Website: everything the travel's public site shows — identity, homepage content, search, and its address.
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { RouteTabs } from '../../ui';
import { Identity } from './Identity';
import { Banners } from './Banners';
import { Testimonials } from './Testimonials';
import { Faqs } from './Faqs';
import { Seo } from './Seo';
import { Domains } from './Domains';
import '../settings/settings.css';
import '../agents/agents.css';
import './website.css';

export const WebsiteScreen: React.FC = () => (
  <div className="ag">
    <RouteTabs
      label="Bagian website"
      items={[
        { to: '/website', label: 'Identitas' },
        { to: '/website/banners', label: 'Banner' },
        { to: '/website/testimonials', label: 'Testimoni' },
        { to: '/website/faq', label: 'FAQ' },
        { to: '/website/seo', label: 'SEO' },
        { to: '/website/domain', label: 'Domain' },
      ]}
    />
    <Routes>
      <Route index element={<Identity />} />
      <Route path="banners" element={<Banners />} />
      <Route path="testimonials" element={<Testimonials />} />
      <Route path="faq" element={<Faqs />} />
      <Route path="seo" element={<Seo />} />
      <Route path="domain" element={<Domains />} />
    </Routes>
  </div>
);
