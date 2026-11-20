'use strict';
// The regions a player can choose on the first screen (src/consent.js) and what each one's privacy policy and terms
// add to the shared text in that region's language. DRAFTS, waiting for a lawyer: every 【待確認】/[TO CONFIRM]
// marks something a lawyer must decide. lang: which shared text (legal/src/<doc>.<lang>.html) the page starts from;
// 'zh-Hans' pages are made from the Traditional Chinese text by the character table.
const R = [];
const add = o => R.push(o);

// ---------- 臺灣 ----------
add({
  code: 'tw', name: '臺灣', lang: 'zh-Hant',
  law: '中華民國《個人資料保護法》',
  privacy: '',          // the shared Traditional Chinese text is written for Taiwan
  terms: ''
});

// ---------- 香港 ----------
add({
  code: 'hk', name: '香港', lang: 'zh-Hant',
  law: '《個人資料（私隱）條例》（第 486 章）',
  privacy: `
<h2 id="region">香港居民補充說明</h2>
<p>對居住在香港的玩家，以下補充說明依《個人資料（私隱）條例》（第 486 章）及六項保障資料原則作出，作為本政策的「收集個人資料聲明」。</p>
<ul>
<li><strong>收集目的與轉移對象：</strong>見第 2、5 點。我們不會把你的個人資料用於直接促銷，也不會提供給他人作直接促銷。</li>
<li><strong>查閱及改正資料：</strong>你可以依條例提出查閱資料要求及改正資料要求，寫信到 service@snowrealm.pet。我們會在收到要求後 40 日內回覆，不收取費用。</li>
<li><strong>資料轉移到香港以外：</strong>資料存放在新加坡，主機及資料庫服務商位於美國，我們以合約要求它們保護資料。</li>
<li><strong>投訴：</strong>可先聯絡我們；你也可以向個人資料私隱專員公署（www.pcpd.org.hk）投訴。</li>
</ul>`,
  terms: `
<h2 id="region">香港居民特別約定</h2>
<p>如果你居住在香港，第 8 點的責任限制不排除、也不限制你依《管制免責條款條例》（第 71 章）、《服務提供（隱含條款）條例》（第 457 章）等香港法律不可排除的權利。第 11 點的準據法與管轄約定，不影響你依香港法律可以在香港法院提出請求的權利。【待確認：是否改採香港法為準據法】</p>`
});

// ---------- 澳門 ----------
add({
  code: 'mo', name: '澳門', lang: 'zh-Hant',
  law: '第 8/2005 號法律《個人資料保護法》',
  privacy: `
<h2 id="region">澳門居民補充說明</h2>
<p>對居住在澳門的玩家，以下補充說明依第 8/2005 號法律《個人資料保護法》作出。</p>
<ul>
<li><strong>資料當事人的權利：</strong>你有資訊權、查閱權、更正權、刪除權及反對權，行使方法見第 7 點，寫信到 service@snowrealm.pet 即可，不收取費用。</li>
<li><strong>資料轉移到澳門以外：</strong>資料存放在新加坡，主機及資料庫服務商位於美國。依該法第 19、20 條，轉移到未確保適當保護程度的地方需符合法定條件；我們依提供你所要求服務的必要性進行轉移，並以合約要求服務商保護資料。【待確認：是否需要向個人資料保護局作出通知或申請許可】</li>
<li><strong>投訴：</strong>可先聯絡我們；你也可以向澳門個人資料保護局投訴。</li>
</ul>`,
  terms: `
<h2 id="region">澳門居民特別約定</h2>
<p>如果你居住在澳門，第 8 點的責任限制不排除你依澳門《消費者權益保護法》及《民法典》不可排除的權利；第 11 點的準據法與管轄約定，不影響你依澳門法律可以在澳門法院提出請求的權利。</p>`
});

// ---------- 中國大陸 (written in Traditional, shown in Simplified) ----------
add({
  code: 'cn', name: '中國大陸', lang: 'zh-Hans',
  law: '《中華人民共和國個人資訊保護法》',
  privacy: `
<h2 id="region">中國大陸地區補充說明</h2>
<p>本遊戲未在中國大陸取得網路遊戲出版許可，也沒有在中國大陸營運或推廣（見第 9 點）。對自行選擇「中國大陸」為居住地區的玩家，我們仍依《中華人民共和國個人資訊保護法》說明如下。</p>
<ul>
<li><strong>處理者：</strong>斯諾瑞姆工作室（SnowRealm），聯絡方式 service@snowrealm.pet。【待確認：是否需依第 53 條在中國大陸設立專門機構或指定代表】</li>
<li><strong>處理的法律依據：</strong>為訂立、履行你作為一方的服務合約所必需（第 13 條第 1 款第（二）項）；名字等選填資料基於你的同意。</li>
<li><strong>不滿十四周歲的未成年人：</strong>其個人資訊屬敏感個人資訊。我們不讓不滿十四周歲的玩家設定名字或註冊帳號，也不收集其身分資料；監護人可依第 7 點要求刪除。</li>
<li><strong>向境外提供：</strong>雲端存檔儲存在新加坡，由美國的主機及資料庫服務商處理（境外接收方名稱見第 5 點）。你可以不開啟雲端存檔（只存在裝置上），即不向境外提供。【待補：依第 39 條取得單獨同意的畫面，以及第 38 條規定的出境條件評估】</li>
<li><strong>你的權利：</strong>知情、決定、查閱、複製、可攜（下載 JSON 檔）、更正、補充、刪除、要求解釋處理規則；近親屬可依第 49 條對死者的個人資訊行使權利。行使方法見第 7 點。</li>
<li><strong>投訴：</strong>可先聯絡我們；也可以向有關的履行個人資訊保護職責的部門投訴、舉報。</li>
</ul>`,
  terms: `
<h2 id="region">中國大陸地區特別約定</h2>
<p>本遊戲未取得中國大陸網路遊戲出版許可，未接入實名認證與防沉迷系統，也沒有在中國大陸營運或推廣。選擇「中國大陸」為居住地區的玩家，請遵守當地法律。本遊戲不提供付費內容，簡體中文介面依當地習慣標示適齡提示（8+）與健康遊戲忠告。【待確認：整體是否應對中國大陸地區關閉服務】</p>`
});

// ---------- 日本 ----------
add({
  code: 'jp', name: '日本', lang: 'ja',
  law: '個人情報の保護に関する法律',
  privacy: '',          // the Japanese text is written for Japan (APPI, Telecommunications Business Act)
  terms: `
<h2 id="region">日本にお住まいの方への特則</h2>
<ul>
<li>準拠法は日本法とし、日本にお住まいの方との紛争はお住まいの地域を管轄する日本の裁判所でも提起できます。【要確認：台湾法との関係】</li>
<li>第 8 条は、消費者契約法第 8 条・第 10 条により無効となる範囲では適用しません。当方の故意・重過失による損害の責任は免除されません。</li>
<li>現在、有料の商品・サービスはありません。今後提供する場合は、特定商取引法に基づく表記、資金決済法に関する表示、景品表示法を遵守した確率表示（いわゆる「コンプガチャ」は行いません）を事前に掲載します。</li>
</ul>`
});

// ---------- 韓國 ----------
add({
  code: 'kr', name: '대한민국', lang: 'ko',
  law: '개인정보 보호법',
  privacy: '',          // the Korean text follows the PIPC's guide for a 개인정보 처리방침
  terms: `
<h2 id="region">대한민국 거주자 특칙</h2>
<ul>
<li>준거법은 대한민국 법으로 하며, 분쟁은 「민사소송법」에 따른 관할 법원에 제기할 수 있습니다. 【검토 필요: 대만법과의 관계】</li>
<li>이 게임은 아직 「게임산업진흥에 관한 법률」에 따른 등급분류를 받지 않았습니다. 【검토 필요: 대한민국 이용자에게 제공하기 전 게임물관리위원회 등급분류 또는 자체등급분류 절차】</li>
<li>현재 유료 상품은 없습니다. 유료화하는 경우 확률형 아이템의 종류와 확률 정보를 게임, 누리집, 광고에 표시하고(「게임산업진흥에 관한 법률」 제33조), 청약철회 조건을 결제 전에 알립니다.</li>
</ul>`
});

// ---------- English-speaking regions ----------
add({
  code: 'us', name: 'United States', lang: 'en',
  law: 'United States federal and state law',
  privacy: `
<h2 id="region">Notice for players in the United States</h2>
<ul>
<li><strong>Children (COPPA).</strong> Players who say they are under 13 cannot enter a name, play online, use quick match or create an account. For them we keep only the random identifiers and game progress needed to run the game and its cloud save ("support for internal operations"), and no other personal information. A parent can ask us to delete a child's data at service@snowrealm.pet. [TO CONFIRM: whether the age screen and this limited collection fully satisfy COPPA as amended in 2025]</li>
<li><strong>State privacy laws (for example California's CCPA/CPRA).</strong> We do not sell or share personal information, do not use it for targeted advertising or profiling, and do not process sensitive personal information. We do not track you across sites, so "Do Not Track" and Global Privacy Control signals change nothing. Whether or not a state law applies to us, you can ask to know, get a copy of, correct or delete your information as in section 7, and we will not treat you differently for asking.</li>
</ul>`,
  terms: `
<h2 id="region">Additional terms for players in the United States</h2>
<p>Nothing in section 8 limits liability that cannot be limited under the law of your state, and section 11 does not take away the protection of consumer laws of your state that cannot be waived by agreement. [TO CONFIRM: governing law and venue for US consumers]</p>`
});
add({
  code: 'uk', name: 'United Kingdom', lang: 'en',
  law: 'the UK GDPR and the Data Protection Act 2018',
  privacy: `
<h2 id="region">Notice for players in the United Kingdom</h2>
<ul>
<li><strong>Controller:</strong> SnowRealm (斯諾瑞姆工作室), Taiwan, service@snowrealm.pet. [TO CONFIRM: whether a UK representative must be appointed under Article 27 UK GDPR]</li>
<li><strong>Lawful bases:</strong> performance of our contract with you (cloud save, leaderboards, online play); legitimate interests (anti-cheat, abuse prevention, support records, keeping box odds checkable); consent (Google Fonts, and an optional public name).</li>
<li><strong>Your rights:</strong> access, rectification, erasure, restriction, data portability (the JSON download) and objection to processing based on legitimate interests; withdraw consent at any time. See section 7.</li>
<li><strong>International transfers:</strong> data is stored in Singapore and handled by service providers in the United States, under their data processing terms with the transfer safeguards they provide (such as the UK International Data Transfer Addendum). [TO CONFIRM]</li>
<li><strong>Children:</strong> settings are private by default for young players (no public name or online play under 13, no profiling, no advertising). We aim to follow the ICO's Age Appropriate Design Code.</li>
<li><strong>Complaints:</strong> you may complain to the Information Commissioner's Office (ico.org.uk).</li>
</ul>`,
  terms: `
<h2 id="region">Additional terms for players in the United Kingdom</h2>
<p>Your statutory rights under the Consumer Rights Act 2015 are not affected. Section 8 does not limit liability for death or personal injury caused by negligence, for fraud, or any other liability that cannot be limited by law. You may bring proceedings in the courts of the part of the UK where you live.</p>`
});
add({
  code: 'au', name: 'Australia', lang: 'en',
  law: 'the Privacy Act 1988 (Cth)',
  privacy: `
<h2 id="region">Notice for players in Australia</h2>
<ul>
<li>We handle personal information in line with the Australian Privacy Principles. [TO CONFIRM: whether the small business exemption applies]</li>
<li><strong>Overseas disclosure (APP 8):</strong> data is stored in Singapore and handled by service providers in the United States.</li>
<li><strong>Access and correction:</strong> as in section 7; we respond within 30 days and charge nothing.</li>
<li><strong>Complaints:</strong> contact us first; if you are not satisfied, you may complain to the Office of the Australian Information Commissioner (oaic.gov.au).</li>
</ul>`,
  terms: `
<h2 id="region">Additional terms for players in Australia</h2>
<p>Our services come with guarantees that cannot be excluded under the Australian Consumer Law. Nothing in these terms excludes, restricts or modifies those guarantees or any other right you have under the Competition and Consumer Act 2010.</p>`
});
add({
  code: 'sg', name: 'Singapore', lang: 'en',
  law: 'the Personal Data Protection Act 2012',
  privacy: `
<h2 id="region">Notice for players in Singapore</h2>
<ul>
<li>We collect, use and disclose personal data for the purposes in section 2, with your consent or as the PDPA allows.</li>
<li><strong>Data protection officer:</strong> service@snowrealm.pet.</li>
<li><strong>Access and correction:</strong> as in section 7; we respond within 30 days.</li>
<li><strong>Transfers:</strong> data is stored in Singapore; our service providers in the United States are bound to protect it to a standard comparable to the PDPA.</li>
<li><strong>Breaches:</strong> we will notify the Personal Data Protection Commission and affected players where the PDPA requires.</li>
<li><strong>Complaints:</strong> you may contact the Personal Data Protection Commission (pdpc.gov.sg).</li>
</ul>`,
  terms: `
<h2 id="region">Additional terms for players in Singapore</h2>
<p>Nothing in these terms limits rights you have under the Consumer Protection (Fair Trading) Act 2003 or liability that cannot be excluded under the Unfair Contract Terms Act 1977 as it applies in Singapore.</p>`
});
add({
  code: 'my', name: 'Malaysia', lang: 'en',
  law: 'the Personal Data Protection Act 2010 (as amended in 2024)',
  privacy: `
<h2 id="region">Notice for players in Malaysia</h2>
<ul>
<li>This notice is given under section 7 of the Personal Data Protection Act 2010, in English and in Bahasa Melayu (below).</li>
<li><strong>Data protection officer:</strong> service@snowrealm.pet. [TO CONFIRM: registration of the DPO with the Commissioner]</li>
<li><strong>Your rights:</strong> access, correction, withdrawal of consent, preventing processing likely to cause damage or distress, and data portability (the JSON download). See section 7.</li>
<li><strong>Transfers outside Malaysia:</strong> data is stored in Singapore and handled by service providers in the United States, where this is necessary to provide the game you asked for.</li>
<li><strong>Breaches:</strong> we will notify the Personal Data Protection Commissioner and affected players as the Act requires.</li>
</ul>
<h3 lang="ms">Notis Perlindungan Data Peribadi (Bahasa Melayu)</h3>
<div lang="ms">
<p>Permainan ini dikendalikan oleh SnowRealm (斯諾瑞姆工作室), Taiwan. Kami memproses nombor akaun rawak, kunci peranti (disimpan sebagai cincangan sahaja), kemajuan permainan, nama yang anda masukkan (pilihan), keputusan papan pendahulu, rekod syiling, rekod perlawanan dan rekod kotak hadiah, untuk menyediakan simpanan awan, papan pendahulu dan permainan dalam talian, mencegah penipuan serta memberi sokongan. Data disimpan di Singapura dan diproses oleh pembekal perkhidmatan di Amerika Syarikat. Anda boleh meminta akses, pembetulan, memuat turun data anda (format JSON), menarik balik persetujuan dan memadam simpanan awan anda (dipadam sepenuhnya selepas 30 hari). Hubungi: service@snowrealm.pet. Memberikan nama adalah pilihan; tanpa simpanan awan, kemajuan hanya disimpan pada peranti anda.</p>
</div>`,
  terms: `
<h2 id="region">Additional terms for players in Malaysia</h2>
<p>Nothing in these terms limits rights you have under the Consumer Protection Act 1999 that cannot be excluded by agreement.</p>`
});
add({
  code: 'other', name: 'Other regions', lang: 'en',
  law: 'the law that applies where you live',
  privacy: `
<h2 id="region">Players in the European Economic Area and Switzerland</h2>
<ul>
<li><strong>Controller:</strong> SnowRealm (斯諾瑞姆工作室), Taiwan, service@snowrealm.pet. [TO CONFIRM: whether an EU representative must be appointed under Article 27 GDPR]</li>
<li><strong>Lawful bases:</strong> performance of a contract (cloud save, leaderboards, online play), legitimate interests (anti-cheat, abuse prevention, support records, checkable box odds), consent (Google Fonts, optional public name).</li>
<li><strong>Your rights:</strong> access, rectification, erasure, restriction, portability (JSON download), objection, and withdrawal of consent; complaint to the data protection authority where you live, work or think a breach happened.</li>
<li><strong>International transfers:</strong> data is stored in Singapore and handled by providers in the United States, under their data processing terms with Standard Contractual Clauses or the EU–US Data Privacy Framework where they are certified. [TO CONFIRM]</li>
<li><strong>Children:</strong> an account needs the age at which your country lets you consent yourself (13 to 16 depending on the country).</li>
</ul>
<h2 id="region2">Everywhere else</h2>
<p>Where the law where you live gives you more rights than this policy, you have those rights too. Write to service@snowrealm.pet.</p>`,
  terms: `
<h2 id="region">Additional terms by region</h2>
<p>If the law where you live gives consumers rights that cannot be excluded or limited by agreement, nothing in these terms (including sections 8 and 11) excludes or limits them.</p>`
});

module.exports = R;
