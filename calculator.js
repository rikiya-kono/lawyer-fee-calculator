/**
 * 弁護士報酬計算ツール - 計算ロジック（拡張版）
 * 旧日弁連報酬基準に基づく
 */

// ========================================
// 旧弁護士報酬基準データ
// ========================================

const FEE_STANDARDS = {
    // 民事事件の経済的利益に基づく計算（訴訟事件等）
    civil: {
        tiers: [
            { max: 300, retainerRate: 0.08, successRate: 0.16 },
            { max: 3000, retainerRate: 0.05, successRate: 0.10 },
            { max: 30000, retainerRate: 0.03, successRate: 0.06 },
            { max: Infinity, retainerRate: 0.02, successRate: 0.04 }
        ],
        retainerAdd: [0, 9, 69, 369],
        successAdd: [0, 18, 138, 738],
        minRetainer: 10,
        minRetainerPromissory: 5
    },

    // 手形・小切手訴訟（訴訟事件の1/2）
    promissory: {
        tiers: [
            { max: 300, retainerRate: 0.04, successRate: 0.08 },
            { max: 3000, retainerRate: 0.025, successRate: 0.05 },
            { max: 30000, retainerRate: 0.015, successRate: 0.03 },
            { max: Infinity, retainerRate: 0.01, successRate: 0.02 }
        ],
        retainerAdd: [0, 4.5, 34.5, 184.5],
        successAdd: [0, 9, 69, 369],
        minRetainer: 5
    },

    // 契約締結交渉（訴訟事件の1/4）
    negotiation: {
        tiers: [
            { max: 300, retainerRate: 0.02, successRate: 0.04 },
            { max: 3000, retainerRate: 0.01, successRate: 0.02 },
            { max: 30000, retainerRate: 0.005, successRate: 0.01 },
            { max: Infinity, retainerRate: 0.003, successRate: 0.006 }
        ],
        retainerAdd: [0, 3, 18, 78],
        successAdd: [0, 6, 36, 156],
        minRetainer: 10
    },

    // 督促手続（着手金は契約締結と同じ、報酬金は訴訟の1/2）
    paymentOrder: {
        minRetainer: 5
    },

    // 離婚事件
    divorce: {
        negotiation: { min: 20, max: 50 },
        litigation: { min: 30, max: 60 }
    },

    // 破産・倒産事件
    bankruptcy: {
        selfBankruptcy: {
            individual: 20,
            soleProprietor: 50,
            corporation: { small: 50, medium: 80, large: 100 }
        },
        otherBankruptcy: 50,
        civilRehabilitation: {
            individual: 20,
            soleProprietor: 30,
            corporation: { small: 100, medium: 150, large: 200 }
        },
        companyArrangement: 100,
        specialLiquidation: 100,
        corporateReorganization: 200,
        voluntaryArrangement: {
            individual: 20,
            soleProprietor: 50,
            corporation: { small: 50, medium: 80, large: 100 }
        }
    },

    // 保全命令
    preservation: {
        basicRate: 0.5,
        hearingRate: 2 / 3,
        successRate: {
            basic: 0.25,
            major: 1 / 3
        }
    },

    // 刑事事件
    criminal: {
        simple: { min: 20, max: 50 },
        complex: { min: 50, max: 100 }
    },

    // 顧問契約
    retainer: {
        business: {
            small: 5,
            medium: 10,
            large: 20
        },
        individual: 0.5
    },

    // 日当
    daily: {
        half: { min: 3, max: 5 },
        full: { min: 5, max: 10 }
    }
};

// ========================================
// グローバル変数（計算結果の保存）
// ========================================

let currentCalculation = null;
let currentCaseType = '';

// ========================================
// ユーティリティ関数
// ========================================

function formatCurrency(amount) {
    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatNumber(amount) {
    return new Intl.NumberFormat('ja-JP').format(amount);
}

function toYen(manyen) {
    return Math.round(manyen * 10000);
}

function getValueByDifficulty(min, max, difficulty) {
    switch (difficulty) {
        case 'low': return min;
        case 'high': return max;
        default: return (min + max) / 2;
    }
}

function getTierIndex(amount) {
    if (amount <= 300) return 0;
    if (amount <= 3000) return 1;
    if (amount <= 30000) return 2;
    return 3;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
}

// ========================================
// 計算関数
// ========================================

/**
 * 民事事件の報酬計算
 */
function calculateCivil(amountManyen, options = {}) {
    const { isNegotiation, isPromissory, isContinued, adjustmentRate, expertiseRate, isSuccessOnly } = options;

    if (amountManyen <= 0) {
        return { retainer: 0, success: 0, details: [], retainerFormula: '', successFormula: '' };
    }

    let standards, minRetainer;

    if (isPromissory) {
        standards = FEE_STANDARDS.promissory;
        minRetainer = FEE_STANDARDS.promissory.minRetainer;
    } else {
        standards = FEE_STANDARDS.civil;
        minRetainer = FEE_STANDARDS.civil.minRetainer;
    }

    const tierIndex = getTierIndex(amountManyen);
    const tier = standards.tiers[tierIndex];

    // 基本計算
    let retainer = amountManyen * tier.retainerRate + standards.retainerAdd[tierIndex];
    let success = amountManyen * tier.successRate + standards.successAdd[tierIndex];

    // 計算式を構築
    const ratePercent = (tier.retainerRate * 100);
    const successRatePercent = (tier.successRate * 100);
    let retainerFormulaParts = [`${formatNumber(amountManyen)}万円 × ${ratePercent}%`];
    let successFormulaParts = [`${formatNumber(amountManyen)}万円 × ${successRatePercent}%`];

    if (standards.retainerAdd[tierIndex] > 0) {
        retainerFormulaParts.push(`+ ${formatNumber(standards.retainerAdd[tierIndex])}万円`);
    }
    if (standards.successAdd[tierIndex] > 0) {
        successFormulaParts.push(`+ ${formatNumber(standards.successAdd[tierIndex])}万円`);
    }

    const details = [];

    // 調停・示談交渉の場合は2/3
    if (isNegotiation && !isPromissory) {
        retainer = retainer * (2 / 3);
        success = success * (2 / 3);
        retainerFormulaParts = [`(${retainerFormulaParts.join(' ')}) × 2/3`];
        successFormulaParts = [`(${successFormulaParts.join(' ')}) × 2/3`];
        details.push('調停・示談交渉: 2/3適用');
    }

    // 継続受任（示談→調停→訴訟）の場合着手金1/2
    if (isContinued) {
        retainer = retainer / 2;
        retainerFormulaParts.push('× 1/2');
        details.push('継続受任: 着手金1/2適用');
    }

    // 最低着手金の適用
    const appliedMin = retainer < minRetainer;
    retainer = Math.max(retainer, minRetainer);
    if (appliedMin) {
        retainerFormulaParts = [`最低着手金 ${formatNumber(minRetainer)}万円を適用`];
    }

    // 事件内容による増減額（±30%）
    if (adjustmentRate && adjustmentRate !== 0) {
        const adjFactor = 1 + (adjustmentRate / 100);
        retainer = retainer * adjFactor;
        success = success * adjFactor;
        const adjSign = adjustmentRate > 0 ? '+' : '';
        retainerFormulaParts.push(`× (1${adjSign}${adjustmentRate}%)`);
        successFormulaParts.push(`× (1${adjSign}${adjustmentRate}%)`);
        details.push(`事件内容による調整: ${adjSign}${adjustmentRate}%`);
    }

    // 専門性加算
    if (expertiseRate && expertiseRate > 0) {
        retainer = retainer * (1 + expertiseRate / 100);
        success = success * (1 + expertiseRate / 100);
        retainerFormulaParts.push(`× (1+${expertiseRate}%)`);
        successFormulaParts.push(`× (1+${expertiseRate}%)`);
        details.push(`専門性加算: +${expertiseRate}%`);
    }

    // 着手金なし・成功報酬のみ
    if (isSuccessOnly) {
        success = success + retainer;
        successFormulaParts = [`報酬金 + 着手金相当額`];
        retainerFormulaParts = ['着手金なし'];
        retainer = 0;
        details.push('着手金なし・成功報酬のみ');
    }

    return {
        retainer: toYen(retainer),
        success: toYen(success),
        retainerFormula: retainerFormulaParts.join(' '),
        successFormula: successFormulaParts.join(' '),
        details
    };
}

/**
 * 契約締結交渉の報酬計算
 */
function calculateNegotiation(amountManyen, options = {}) {
    const { adjustmentRate } = options;

    if (amountManyen <= 0) {
        return { retainer: 0, success: 0, details: [] };
    }

    const standards = FEE_STANDARDS.negotiation;
    const tierIndex = getTierIndex(amountManyen);
    const tier = standards.tiers[tierIndex];

    let retainer = amountManyen * tier.retainerRate + standards.retainerAdd[tierIndex];
    let success = amountManyen * tier.successRate + standards.successAdd[tierIndex];

    const details = [];
    details.push(`契約の経済的利益: ${formatNumber(amountManyen)}万円`);

    // 最低着手金
    retainer = Math.max(retainer, standards.minRetainer);

    // 増減額
    if (adjustmentRate && adjustmentRate !== 0) {
        const adjFactor = 1 + (adjustmentRate / 100);
        retainer = retainer * adjFactor;
        success = success * adjFactor;
        details.push(`事件内容による調整: ${adjustmentRate > 0 ? '+' : ''}${adjustmentRate}%`);
    }

    return {
        retainer: toYen(retainer),
        success: toYen(success),
        details
    };
}

/**
 * 督促手続事件の報酬計算
 */
function calculatePaymentOrder(amountManyen, options = {}) {
    const { toLitigation } = options;

    if (amountManyen <= 0) {
        return { retainer: 0, success: 0, litigationDiff: 0, details: [] };
    }

    // 着手金は契約締結交渉と同じ
    const negotiationStandards = FEE_STANDARDS.negotiation;
    const tierIndex = getTierIndex(amountManyen);
    const tier = negotiationStandards.tiers[tierIndex];

    let retainer = amountManyen * tier.retainerRate + negotiationStandards.retainerAdd[tierIndex];
    retainer = Math.max(retainer, FEE_STANDARDS.paymentOrder.minRetainer);

    // 報酬金は訴訟事件の1/2
    const civilTier = FEE_STANDARDS.civil.tiers[tierIndex];
    let success = (amountManyen * civilTier.successRate + FEE_STANDARDS.civil.successAdd[tierIndex]) / 2;

    const details = [];
    details.push(`請求債権額: ${formatNumber(amountManyen)}万円`);
    details.push('報酬金は金銭等の具体的な回収をしたときに限り請求可能');

    let litigationDiff = 0;
    if (toLitigation) {
        // 訴訟に移行する場合の差額
        const fullRetainer = amountManyen * civilTier.retainerRate + FEE_STANDARDS.civil.retainerAdd[tierIndex];
        litigationDiff = Math.max(fullRetainer - retainer, 0);
        details.push(`訴訟移行時の追加着手金: ${formatNumber(litigationDiff)}万円`);
    }

    return {
        retainer: toYen(retainer),
        success: toYen(success),
        litigationDiff: toYen(litigationDiff),
        details
    };
}

/**
 * 離婚事件の報酬計算
 */
function calculateDivorce(options = {}) {
    const { type, complexity, isContinued, propertyManyen, expertiseRate } = options;

    const range = type === 'litigation'
        ? FEE_STANDARDS.divorce.litigation
        : FEE_STANDARDS.divorce.negotiation;

    let baseAmount = getValueByDifficulty(range.min, range.max, complexity);

    let retainer = baseAmount;
    let success = baseAmount;

    const details = [];
    details.push(`事件種類: ${type === 'litigation' ? '訴訟' : '交渉・調停'}`);
    details.push(`基本報酬: ${formatNumber(baseAmount)}万円`);

    if (isContinued) {
        retainer = retainer / 2;
        details.push('継続受任: 着手金1/2適用');
    }

    let propertyRetainer = 0;
    let propertySuccess = 0;
    if (propertyManyen > 0) {
        const propertyFee = calculateCivil(propertyManyen, { isNegotiation: type !== 'litigation' });
        propertyRetainer = propertyFee.retainer / 10000;
        propertySuccess = propertyFee.success / 10000;
        details.push(`財産分与・慰謝料等: ${formatNumber(propertyManyen)}万円の経済的利益を加算`);
    }

    retainer += propertyRetainer;
    success += propertySuccess;

    if (expertiseRate && expertiseRate > 0) {
        retainer = retainer * (1 + expertiseRate / 100);
        success = success * (1 + expertiseRate / 100);
        details.push(`専門性加算: +${expertiseRate}%`);
    }

    return {
        retainer: toYen(retainer),
        success: toYen(success),
        details
    };
}

/**
 * 破産・再生事件の報酬計算
 */
function calculateBankruptcy(options = {}) {
    const { caseType, applicantType, scale, expertiseRate } = options;

    let retainer = 0;
    const details = [];
    let note = '';

    const getScaleAmount = (scaleObj) => {
        if (typeof scaleObj === 'number') return scaleObj;
        return scaleObj[scale] || scaleObj.small;
    };

    switch (caseType) {
        case 'self-bankruptcy':
            if (applicantType === 'individual') {
                retainer = FEE_STANDARDS.bankruptcy.selfBankruptcy.individual;
                details.push('自己破産（個人・非事業者）');
            } else if (applicantType === 'sole-proprietor') {
                retainer = FEE_STANDARDS.bankruptcy.selfBankruptcy.soleProprietor;
                details.push('自己破産（個人事業主）');
            } else {
                retainer = getScaleAmount(FEE_STANDARDS.bankruptcy.selfBankruptcy.corporation);
                details.push(`自己破産（法人・${scale === 'large' ? '大規模' : scale === 'medium' ? '中規模' : '小規模'}）`);
            }
            note = '報酬金は免責決定を受けたときに限り発生';
            break;

        case 'other-bankruptcy':
            retainer = FEE_STANDARDS.bankruptcy.otherBankruptcy;
            details.push('破産（自己破産以外）');
            break;

        case 'civil-rehabilitation':
            if (applicantType === 'individual') {
                retainer = FEE_STANDARDS.bankruptcy.civilRehabilitation.individual;
                details.push('民事再生（個人・小規模個人再生）');
            } else if (applicantType === 'sole-proprietor') {
                retainer = FEE_STANDARDS.bankruptcy.civilRehabilitation.soleProprietor;
                details.push('民事再生（非事業者）');
            } else {
                retainer = getScaleAmount(FEE_STANDARDS.bankruptcy.civilRehabilitation.corporation);
                details.push(`民事再生（事業者・${scale === 'large' ? '大規模' : scale === 'medium' ? '中規模' : '小規模'}）`);
            }
            note = '報酬金は再生計画認可決定を受けたときに限り発生。執務報酬を別途協議可能。';
            break;

        case 'company-arrangement':
            retainer = FEE_STANDARDS.bankruptcy.companyArrangement;
            details.push('会社整理');
            break;

        case 'special-liquidation':
            retainer = FEE_STANDARDS.bankruptcy.specialLiquidation;
            details.push('特別清算');
            break;

        case 'corporate-reorganization':
            retainer = FEE_STANDARDS.bankruptcy.corporateReorganization;
            details.push('会社更生');
            break;

        case 'voluntary-arrangement':
            if (applicantType === 'individual') {
                retainer = FEE_STANDARDS.bankruptcy.voluntaryArrangement.individual;
                details.push('任意整理（非事業者）');
            } else if (applicantType === 'sole-proprietor') {
                retainer = FEE_STANDARDS.bankruptcy.voluntaryArrangement.soleProprietor;
                details.push('任意整理（事業者）');
            } else {
                retainer = getScaleAmount(FEE_STANDARDS.bankruptcy.voluntaryArrangement.corporation);
                details.push(`任意整理（法人・${scale === 'large' ? '大規模' : scale === 'medium' ? '中規模' : '小規模'}）`);
            }
            break;
    }

    details.push(`基本着手金: ${formatNumber(retainer)}万円以上`);

    if (expertiseRate && expertiseRate > 0) {
        retainer = retainer * (1 + expertiseRate / 100);
        details.push(`専門性加算: +${expertiseRate}%`);
    }

    return {
        retainer: toYen(retainer),
        success: 0,
        note,
        details
    };
}

/**
 * 保全命令申立事件の報酬計算
 */
function calculatePreservation(amountManyen, options = {}) {
    const { procedureType, withMainCase } = options;

    if (amountManyen <= 0) {
        return { retainer: 0, success: 0, details: [] };
    }

    // 本案の着手金を計算
    const mainCase = calculateCivil(amountManyen, {});
    const mainRetainer = mainCase.retainer;
    const mainSuccess = mainCase.success;

    const details = [];
    details.push(`本案の経済的利益: ${formatNumber(amountManyen)}万円`);

    let retainer, success;

    if (procedureType === 'hearing') {
        retainer = mainRetainer * (2 / 3);
        success = mainSuccess * (1 / 3);
        details.push('審尋・口頭弁論を経る場合: 着手金2/3');
    } else {
        retainer = mainRetainer * 0.5;
        success = mainSuccess * 0.25;
        details.push('基本: 着手金1/2');
    }

    if (withMainCase) {
        details.push('本案事件と併せて受任（別途請求可）');
    }

    details.push('報酬金は事件が重大・複雑なとき、または本案の目的を達したときに請求可能');

    return {
        retainer: Math.round(retainer),
        success: Math.round(success),
        mainRetainer: mainRetainer,
        details
    };
}

/**
 * 刑事事件の報酬計算
 */
function calculateCriminal(options = {}) {
    const { stage, complexity, difficulty, isContinued, expertiseRate } = options;

    const range = complexity === 'complex'
        ? FEE_STANDARDS.criminal.complex
        : FEE_STANDARDS.criminal.simple;

    let baseAmount = getValueByDifficulty(range.min, range.max, difficulty);

    let retainer = baseAmount;
    let success = baseAmount;

    const details = [];
    details.push(`事件段階: ${stage === 'pre-indictment' ? '起訴前' : stage === 'appeal' ? '上訴審' : '起訴後（第一審）'}`);
    details.push(`事案: ${complexity === 'complex' ? '複雑・重大' : '事案簡明'}`);

    if (isContinued && complexity === 'simple') {
        retainer = retainer / 2;
        details.push('継続受任（事案簡明）: 着手金1/2適用');
    }

    if (expertiseRate && expertiseRate > 0) {
        retainer = retainer * (1 + expertiseRate / 100);
        success = success * (1 + expertiseRate / 100);
        details.push(`専門性加算: +${expertiseRate}%`);
    }

    const note = stage === 'pre-indictment'
        ? '報酬金は不起訴または略式命令の場合に発生'
        : '報酬金は無罪、執行猶予、刑の軽減等の結果に応じて発生';

    return {
        retainer: toYen(retainer),
        success: toYen(success),
        note,
        details
    };
}

/**
 * 顧問契約の報酬計算
 */
function calculateRetainer(options = {}) {
    const { type, scale, periodMonths } = options;

    let monthlyFee = 0;
    const details = [];

    if (type === 'business') {
        monthlyFee = FEE_STANDARDS.retainer.business[scale] || 5;
        details.push(`事業者顧問（${scale === 'large' ? '大規模' : scale === 'medium' ? '中規模' : '小規模'}）`);
    } else {
        monthlyFee = FEE_STANDARDS.retainer.individual;
        details.push('非事業者（個人）顧問');
    }

    const total = monthlyFee * periodMonths;
    details.push(`月額: ${formatNumber(monthlyFee)}万円`);
    details.push(`契約期間: ${periodMonths}ヶ月`);

    return {
        monthly: toYen(monthlyFee),
        total: toYen(total),
        period: periodMonths,
        details
    };
}

/**
 * 日当の計算
 */
function calculateDaily(options = {}) {
    const { type, rate, count } = options;

    const range = type === 'full'
        ? FEE_STANDARDS.daily.full
        : FEE_STANDARDS.daily.half;

    let perDay = getValueByDifficulty(range.min, range.max, rate);
    const total = perDay * count;

    const details = [];
    details.push(`拘束時間: ${type === 'full' ? '一日（往復4時間超）' : '半日（往復2〜4時間）'}`);
    details.push(`1日あたり: ${formatNumber(perDay)}万円`);
    details.push(`日数: ${count}日`);

    return {
        perDay: toYen(perDay),
        total: toYen(total),
        count: count,
        details
    };
}

// ========================================
// UI制御
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initFormHandlers();
    initModalHandlers();
    initActionButtons();
    initGuideModal();
});

/**
 * 初回訪問時のガイドモーダル
 */
function initGuideModal() {
    const guideModal = document.getElementById('guide-modal');
    const guideClose = document.getElementById('guide-close');
    const guideStart = document.getElementById('guide-start');
    const dontShowCheckbox = document.getElementById('guide-dont-show');

    // 初回訪問チェック
    const hasVisited = localStorage.getItem('lawyer-fee-calc-visited');

    if (!hasVisited) {
        guideModal.style.display = 'flex';
    }

    const closeGuide = () => {
        guideModal.style.display = 'none';
        if (dontShowCheckbox.checked) {
            localStorage.setItem('lawyer-fee-calc-visited', 'true');
        }
    };

    guideClose.addEventListener('click', closeGuide);
    guideStart.addEventListener('click', () => {
        closeGuide();
        localStorage.setItem('lawyer-fee-calc-visited', 'true');
    });

    guideModal.addEventListener('click', (e) => {
        if (e.target === guideModal) closeGuide();
    });
}

function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;

            tabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetId) {
                    content.classList.add('active');
                }
            });

            document.getElementById('results').style.display = 'none';
        });
    });
}

function initFormHandlers() {
    // 破産事件の種類による表示切替
    const bankruptcyCaseType = document.getElementById('bankruptcy-case-type');
    const bankruptcyType = document.getElementById('bankruptcy-type');
    const corporationDetails = document.getElementById('corporation-details');

    const updateBankruptcyForm = () => {
        const showScale = bankruptcyType.value === 'corporation';
        corporationDetails.style.display = showScale ? 'block' : 'none';
    };

    if (bankruptcyType) {
        bankruptcyType.addEventListener('change', updateBankruptcyForm);
    }

    // 顧問契約の種類による表示切替
    const retainerType = document.getElementById('retainer-type');
    const businessScaleGroup = document.getElementById('business-scale-group');

    if (retainerType) {
        retainerType.addEventListener('change', () => {
            businessScaleGroup.style.display =
                retainerType.value === 'business' ? 'block' : 'none';
        });
    }

    // 計算ボタン
    const calculateBtn = document.getElementById('calculate-btn');
    calculateBtn.addEventListener('click', performCalculation);
}

function initModalHandlers() {
    // 見積書モーダル
    const estimateModal = document.getElementById('estimate-modal');
    const previewModal = document.getElementById('preview-modal');

    document.getElementById('modal-close').addEventListener('click', () => {
        estimateModal.style.display = 'none';
    });

    document.getElementById('preview-close').addEventListener('click', () => {
        previewModal.style.display = 'none';
    });

    document.getElementById('preview-estimate-btn').addEventListener('click', () => {
        generateEstimatePreview();
        estimateModal.style.display = 'none';
        previewModal.style.display = 'flex';
    });

    document.getElementById('download-estimate-btn').addEventListener('click', () => {
        generateEstimatePreview();
        estimateModal.style.display = 'none';
        previewModal.style.display = 'flex';
        setTimeout(downloadPDF, 100);
    });

    document.getElementById('back-to-edit-btn').addEventListener('click', () => {
        previewModal.style.display = 'none';
        estimateModal.style.display = 'flex';
    });

    document.getElementById('final-download-btn').addEventListener('click', downloadPDF);

    // オーバーレイクリックで閉じる
    estimateModal.addEventListener('click', (e) => {
        if (e.target === estimateModal) estimateModal.style.display = 'none';
    });

    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) previewModal.style.display = 'none';
    });
}

function initActionButtons() {
    document.getElementById('copy-btn').addEventListener('click', copyResult);
    document.getElementById('print-btn').addEventListener('click', () => window.print());
    document.getElementById('export-btn').addEventListener('click', () => {
        document.getElementById('estimate-modal').style.display = 'flex';
    });
}

/**
 * 計算実行
 */
function performCalculation() {
    const activeTab = document.querySelector('.tab.active').dataset.tab;
    const taxRate = parseFloat(document.getElementById('tax-rate').value) / 100;

    let result;
    currentCaseType = activeTab;

    switch (activeTab) {
        case 'civil':
            result = calculateCivilFromForm();
            break;
        case 'negotiation':
            result = calculateNegotiationFromForm();
            break;
        case 'payment-order':
            result = calculatePaymentOrderFromForm();
            break;
        case 'divorce':
            result = calculateDivorceFromForm();
            break;
        case 'bankruptcy':
            result = calculateBankruptcyFromForm();
            break;
        case 'preservation':
            result = calculatePreservationFromForm();
            break;
        case 'criminal':
            result = calculateCriminalFromForm();
            break;
        case 'retainer':
            result = calculateRetainerFromForm();
            break;
        case 'daily':
            result = calculateDailyFromForm();
            break;
    }

    currentCalculation = { ...result, taxRate, caseType: activeTab };

    const resultHtml = formatResult(result, taxRate, activeTab);
    const resultCard = document.getElementById('result-card');
    resultCard.innerHTML = resultHtml;

    const resultsSection = document.getElementById('results');
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ========================================
// フォームからのデータ取得
// ========================================

function calculateCivilFromForm() {
    const amount = parseFloat(document.getElementById('civil-amount').value) || 0;
    const isNegotiation = document.getElementById('civil-negotiation').checked;
    const isPromissory = document.getElementById('civil-promissory').checked;
    const isContinued = document.getElementById('civil-continued').checked;
    const adjustmentRate = parseFloat(document.getElementById('civil-adjustment').value) || 0;
    const expertiseRate = parseFloat(document.getElementById('civil-expertise').value) || 0;
    const isSuccessOnly = document.getElementById('civil-success-only').checked;

    return calculateCivil(amount, {
        isNegotiation,
        isPromissory,
        isContinued,
        adjustmentRate,
        expertiseRate,
        isSuccessOnly
    });
}

function calculateNegotiationFromForm() {
    const amount = parseFloat(document.getElementById('negotiation-amount').value) || 0;
    const adjustmentRate = parseFloat(document.getElementById('negotiation-adjustment').value) || 0;

    return calculateNegotiation(amount, { adjustmentRate });
}

function calculatePaymentOrderFromForm() {
    const amount = parseFloat(document.getElementById('payment-order-amount').value) || 0;
    const toLitigation = document.getElementById('payment-order-litigation').checked;

    return calculatePaymentOrder(amount, { toLitigation });
}

function calculateDivorceFromForm() {
    const type = document.getElementById('divorce-type').value;
    const complexity = document.getElementById('divorce-complexity').value;
    const isContinued = document.getElementById('divorce-continued').checked;
    const propertyManyen = parseFloat(document.getElementById('divorce-property').value) || 0;
    const expertiseRate = parseFloat(document.getElementById('divorce-expertise').value) || 0;

    return calculateDivorce({
        type,
        complexity,
        isContinued,
        propertyManyen,
        expertiseRate
    });
}

function calculateBankruptcyFromForm() {
    const caseType = document.getElementById('bankruptcy-case-type').value;
    const applicantType = document.getElementById('bankruptcy-type').value;
    const scale = document.getElementById('bankruptcy-scale').value;
    const expertiseRate = parseFloat(document.getElementById('bankruptcy-expertise').value) || 0;

    return calculateBankruptcy({
        caseType,
        applicantType,
        scale,
        expertiseRate
    });
}

function calculatePreservationFromForm() {
    const amount = parseFloat(document.getElementById('preservation-amount').value) || 0;
    const procedureType = document.getElementById('preservation-type').value;
    const withMainCase = document.getElementById('preservation-with-main').checked;

    return calculatePreservation(amount, { procedureType, withMainCase });
}

function calculateCriminalFromForm() {
    const stage = document.getElementById('criminal-stage').value;
    const complexity = document.getElementById('criminal-complexity').value;
    const difficulty = document.getElementById('criminal-difficulty').value;
    const isContinued = document.getElementById('criminal-continued').checked;
    const expertiseRate = parseFloat(document.getElementById('criminal-expertise').value) || 0;

    return calculateCriminal({
        stage,
        complexity,
        difficulty,
        isContinued,
        expertiseRate
    });
}

function calculateRetainerFromForm() {
    const type = document.getElementById('retainer-type').value;
    const scale = document.getElementById('retainer-scale').value;
    const periodMonths = parseInt(document.getElementById('retainer-period').value) || 12;

    return calculateRetainer({
        type,
        scale,
        periodMonths
    });
}

function calculateDailyFromForm() {
    const type = document.getElementById('daily-type').value;
    const rate = document.getElementById('daily-rate').value;
    const count = parseInt(document.getElementById('daily-count').value) || 1;

    return calculateDaily({
        type,
        rate,
        count
    });
}

// ========================================
// 結果フォーマット
// ========================================

function formatResult(result, taxRate, caseType) {
    let html = '';

    // 金額セクション
    html += '<div class="result-section"><div class="result-section-title">計算結果</div>';

    if (caseType === 'retainer') {
        html += formatRetainerResultHtml(result, taxRate);
    } else if (caseType === 'daily') {
        html += formatDailyResultHtml(result, taxRate);
    } else {
        html += formatStandardResultHtml(result, taxRate);
    }

    html += '</div>';

    // 注記
    if (result.note) {
        html += `<div class="result-note">※ ${result.note}</div>`;
    }

    return html;
}

function formatStandardResultHtml(result, taxRate) {
    const retainerWithTax = result.retainer * (1 + taxRate);
    const successWithTax = result.success * (1 + taxRate);
    const total = retainerWithTax + successWithTax;

    let html = '';

    // 着手金
    html += `
        <div class="result-item-block">
            <div class="result-item">
                <span class="result-label">着手金（税抜）</span>
                <span class="result-value">${formatCurrency(result.retainer)}</span>
            </div>
            ${result.retainerFormula ? `<div class="result-formula">${result.retainerFormula}</div>` : ''}
        </div>
    `;

    if (taxRate > 0) {
        html += `
            <div class="result-item">
                <span class="result-label">着手金（税込）</span>
                <span class="result-value">${formatCurrency(retainerWithTax)}</span>
            </div>
        `;
    }

    // 報酬金
    if (result.success > 0) {
        html += `
            <div class="result-item-block">
                <div class="result-item">
                    <span class="result-label">報酬金（税抜）</span>
                    <span class="result-value">${formatCurrency(result.success)}</span>
                </div>
                ${result.successFormula ? `<div class="result-formula">${result.successFormula}</div>` : ''}
            </div>
        `;

        if (taxRate > 0) {
            html += `
                <div class="result-item">
                    <span class="result-label">報酬金（税込）</span>
                    <span class="result-value">${formatCurrency(successWithTax)}</span>
                </div>
            `;
        }
    }

    // 督促手続の訴訟移行時差額
    if (result.litigationDiff && result.litigationDiff > 0) {
        html += `
            <div class="result-item">
                <span class="result-label">訴訟移行時追加着手金（税抜）</span>
                <span class="result-value">${formatCurrency(result.litigationDiff)}</span>
            </div>
        `;
    }

    if (taxRate > 0 && (result.retainer > 0 || result.success > 0)) {
        html += `
            <div class="result-item result-total">
                <span class="result-label">合計（税込）</span>
                <span class="result-value">${formatCurrency(total)}</span>
            </div>
        `;
    }

    return html;
}

function formatRetainerResultHtml(result, taxRate) {
    const monthlyWithTax = result.monthly * (1 + taxRate);
    const totalWithTax = result.total * (1 + taxRate);

    let html = `
        <div class="result-item">
            <span class="result-label">月額顧問料（税抜）</span>
            <span class="result-value">${formatCurrency(result.monthly)}</span>
        </div>
    `;

    if (taxRate > 0) {
        html += `
            <div class="result-item">
                <span class="result-label">月額顧問料（税込）</span>
                <span class="result-value">${formatCurrency(monthlyWithTax)}</span>
            </div>
        `;
    }

    html += `
        <div class="result-item">
            <span class="result-label">${result.period}ヶ月分（税抜）</span>
            <span class="result-value">${formatCurrency(result.total)}</span>
        </div>
    `;

    if (taxRate > 0) {
        html += `
            <div class="result-item result-total">
                <span class="result-label">${result.period}ヶ月分（税込）</span>
                <span class="result-value">${formatCurrency(totalWithTax)}</span>
            </div>
        `;
    }

    return html;
}

function formatDailyResultHtml(result, taxRate) {
    const perDayWithTax = result.perDay * (1 + taxRate);
    const totalWithTax = result.total * (1 + taxRate);

    let html = `
        <div class="result-item">
            <span class="result-label">日当/日（税抜）</span>
            <span class="result-value">${formatCurrency(result.perDay)}</span>
        </div>
    `;

    if (taxRate > 0) {
        html += `
            <div class="result-item">
                <span class="result-label">日当/日（税込）</span>
                <span class="result-value">${formatCurrency(perDayWithTax)}</span>
            </div>
        `;
    }

    if (result.count > 1) {
        html += `
            <div class="result-item">
                <span class="result-label">${result.count}日分（税抜）</span>
                <span class="result-value">${formatCurrency(result.total)}</span>
            </div>
        `;

        if (taxRate > 0) {
            html += `
                <div class="result-item result-total">
                    <span class="result-label">${result.count}日分（税込）</span>
                    <span class="result-value">${formatCurrency(totalWithTax)}</span>
                </div>
            `;
        }
    }

    return html;
}

// ========================================
// 見積書生成
// ========================================

function generateEstimatePreview() {
    const office = document.getElementById('estimate-office').value || '○○法律事務所';
    const lawyer = document.getElementById('estimate-lawyer').value || '弁護士 ○○ ○○';
    const address = document.getElementById('estimate-address').value || '';
    const tel = document.getElementById('estimate-tel').value || '';
    const client = document.getElementById('estimate-client').value || '○○ 様';
    const caseTitle = document.getElementById('estimate-case').value || '○○事件について';
    const notes = document.getElementById('estimate-notes').value || '・実費（印紙代、郵券代、交通費等）は別途ご請求いたします。\n・上記金額は概算であり、事件の進行により変動する場合がございます。';
    const validity = document.getElementById('estimate-validity').value || '発行日より30日間';

    const calc = currentCalculation;
    const today = formatDate(new Date());

    let tableRows = '';
    let subtotal = 0;

    if (calc.caseType === 'retainer') {
        tableRows = `
            <tr>
                <td>月額顧問料</td>
                <td class="amount">${formatCurrency(calc.monthly)}</td>
            </tr>
            <tr>
                <td>${calc.period}ヶ月分</td>
                <td class="amount">${formatCurrency(calc.total)}</td>
            </tr>
        `;
        subtotal = calc.total;
    } else if (calc.caseType === 'daily') {
        tableRows = `
            <tr>
                <td>日当（${calc.count}日分）</td>
                <td class="amount">${formatCurrency(calc.total)}</td>
            </tr>
        `;
        subtotal = calc.total;
    } else {
        if (calc.retainer > 0) {
            tableRows += `
                <tr>
                    <td>着手金</td>
                    <td class="amount">${formatCurrency(calc.retainer)}</td>
                </tr>
            `;
            subtotal += calc.retainer;
        }
        if (calc.success > 0) {
            tableRows += `
                <tr>
                    <td>報酬金（成功時）</td>
                    <td class="amount">${formatCurrency(calc.success)}</td>
                </tr>
            `;
            subtotal += calc.success;
        }
        if (calc.litigationDiff && calc.litigationDiff > 0) {
            tableRows += `
                <tr>
                    <td>訴訟移行時追加着手金</td>
                    <td class="amount">${formatCurrency(calc.litigationDiff)}</td>
                </tr>
            `;
        }
    }

    const tax = calc.taxRate > 0 ? Math.round(subtotal * calc.taxRate) : 0;
    const total = subtotal + tax;

    const html = `
        <h1>御 見 積 書</h1>
        
        <div class="estimate-date">${today}</div>
        
        <div class="estimate-header">
            <div class="estimate-client">
                <div class="estimate-client-name">${client}</div>
                <div>下記のとおりお見積り申し上げます。</div>
            </div>
            <div class="estimate-info">
                <p><strong>${office}</strong></p>
                <p>${lawyer}</p>
                ${address ? `<p>${address}</p>` : ''}
                ${tel ? `<p>TEL: ${tel}</p>` : ''}
            </div>
        </div>
        
        <div class="estimate-case-title">
            <strong>案件名:</strong> ${caseTitle}
        </div>
        
        <table class="estimate-table">
            <thead>
                <tr>
                    <th style="width: 70%">項目</th>
                    <th style="width: 30%">金額（税抜）</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
                <tr class="total-row">
                    <td>小計</td>
                    <td class="amount">${formatCurrency(subtotal)}</td>
                </tr>
                <tr class="total-row">
                    <td>消費税（${calc.taxRate * 100}%）</td>
                    <td class="amount">${formatCurrency(tax)}</td>
                </tr>
                <tr class="grand-total">
                    <td><strong>合計金額</strong></td>
                    <td class="amount"><strong>${formatCurrency(total)}</strong></td>
                </tr>
            </tbody>
        </table>
        
        <div class="estimate-notes">
            <h3>備考・特記事項</h3>
            ${notes.split('\n').map(line => `<p>${line}</p>`).join('')}
        </div>
        
        <div class="estimate-validity">
            見積有効期限: ${validity}
        </div>
        
        <div class="estimate-office-info">
            <div class="estimate-office-name">${office}</div>
            <div>${lawyer}</div>
            <span class="estimate-stamp-area">印</span>
        </div>
    `;

    document.getElementById('estimate-preview').innerHTML = html;
}

function downloadPDF() {
    const element = document.getElementById('estimate-preview');

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    const filename = `Estimate_${yyyy}${mm}${dd}_${hh}${min}.pdf`;

    const opt = {
        margin: 10,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
}

// ========================================
// クリップボードコピー
// ========================================

function copyResult() {
    const resultCard = document.getElementById('result-card');
    const items = resultCard.querySelectorAll('.result-item');

    let text = '【弁護士報酬計算結果】\n';
    text += '（旧日弁連報酬基準に基づく概算）\n\n';

    items.forEach(item => {
        const labelEl = item.querySelector('.result-label');
        const valueEl = item.querySelector('.result-value');
        if (labelEl && valueEl) {
            text += `${labelEl.textContent}: ${valueEl.textContent}\n`;
        } else if (labelEl) {
            text += `${labelEl.textContent}\n`;
        }
    });

    const note = resultCard.querySelector('.result-note');
    if (note) {
        text += '\n' + note.textContent;
    }

    navigator.clipboard.writeText(text).then(() => {
        showToast();
    });
}

function showToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}
