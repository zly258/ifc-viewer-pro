import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import zh, { LocaleMessages } from '../locales/zh';
import en from '../locales/en';

export type Language = 'zh' | 'en';

const messages: Record<Language, LocaleMessages> = { zh, en };

interface LanguageContextType {
  lang: Language;
  t: LocaleMessages;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'zh',
  t: zh,
  setLanguage: () => {},
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('bimvision_lang') as Language) || 'zh';
  });

  const setLanguage = useCallback((l: Language) => {
    setLang(l);
    localStorage.setItem('bimvision_lang', l);
  }, []);

  const value: LanguageContextType = {
    lang,
    t: messages[lang],
    setLanguage,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
