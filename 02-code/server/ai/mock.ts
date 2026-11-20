/** mock 模式下的固定返回，用于离线开发与自动化测试 */

const SUSPEND_OVERVIEW = {
  wordBasic: {
    lemma: 'suspend',
    phonetic: '/səˈspend/',
    pos: ['v.'],
    etymology:
      '源自拉丁语 suspendere，由 sub-（在下方）与 pendere（悬挂、称量）构成，字面意思是“挂在下面”。',
    semanticHistory:
      '最初表示具体的悬挂动作；后来通过“使悬而不落”引申出“使中止、暂缓”，再扩展到职位、资格与法令的暂停。三个义项共享“悬置”的意象，但现代用法中“中止”与“悬挂”已明显分化。',
    coreMeaning: '使某物或某事处于“悬而未决 / 悬而不落”的状态',
    coreMeaningNote:
      '该核心意义可以解释多数义项，但“停职停学”已经制度化，理解时仍需结合具体制度背景，不能仅凭核心意义推导。',
    evidenceType: 'ai_inferred',
  },
  senses: [
    {
      senseNo: 1,
      pos: 'v.',
      cnGloss: '暂停，中止（正式决定）',
      enDefinition:
        'to officially stop something for a period of time, especially because a decision is being made or a problem exists',
      frequency: 'high',
      cet6Importance: 'high',
      usageNote:
        '强调由权威方作出正式决定、且通常是暂时性的；宾语多为活动、服务、规则或程序，不用于个人自行“暂停”。',
      evidenceType: 'ai_inferred',
    },
    {
      senseNo: 2,
      pos: 'v.',
      cnGloss: '悬挂，悬吊',
      enDefinition: 'to hang something from above so that it is free to move',
      frequency: 'mid',
      cet6Importance: 'mid',
      usageNote: '物理义，通常用被动结构 be suspended from，注意介词 from 表示悬挂点。',
      evidenceType: 'ai_inferred',
    },
    {
      senseNo: 3,
      pos: 'v.',
      cnGloss: '使暂时停职（停学），停赛',
      enDefinition:
        'to temporarily remove someone from a job, school, or team as a punishment or during an investigation',
      frequency: 'mid',
      cet6Importance: 'mid',
      usageNote:
        '必须涉及制度性身份（职务、学籍、参赛资格）与惩罚或调查背景，不能用来表达普通的“让某人休息”。',
      evidenceType: 'ai_inferred',
    },
  ],
};

const SPOIL_OVERVIEW = {
  wordBasic: {
    lemma: 'spoil',
    phonetic: '/spɔɪl/',
    pos: ['v.'],
    etymology:
      '源自古法语 espoillier（掠夺、剥去衣物），进一步来自拉丁语 spoliare，本义与“剥夺”有关。',
    semanticHistory:
      '“掠夺”这一本义在现代英语中已基本消失，转而发展出“损坏、破坏”（剥夺其价值）与“过度纵容”（把孩子“惯坏”）两类用法；食物“变坏”则来自“被破坏”的具体化。',
    coreMeaning: '使原本良好的状态遭到破坏',
    coreMeaningNote:
      '“溺爱”义与“破坏”义共享“使变坏”的结果，但施动者的意图完全不同，理解时需分开把握。',
    evidenceType: 'ai_inferred',
  },
  senses: [
    {
      senseNo: 1,
      pos: 'v.',
      cnGloss: '破坏，毁掉（计划、兴致、体验）',
      enDefinition: 'to damage or ruin something so that it is no longer enjoyable or effective',
      frequency: 'high',
      cet6Importance: 'high',
      usageNote:
        '常用于抽象对象（plans, mood, surprise, evening）；语气比 damage 更强调“让好事变坏”，不用于纯物理损伤。',
      evidenceType: 'ai_inferred',
    },
    {
      senseNo: 2,
      pos: 'v.',
      cnGloss: '溺爱，惯坏',
      enDefinition: 'to give a child everything they want, with a bad effect on their character',
      frequency: 'mid',
      cet6Importance: 'mid',
      usageNote:
        '对象通常是人（尤其孩子），且含批评意味；be spoiled 可表示“被惯坏了”，与被动语态形式重合。',
      evidenceType: 'ai_inferred',
    },
    {
      senseNo: 3,
      pos: 'v.',
      cnGloss: '（食物）变质，变坏',
      enDefinition: 'to become unfit to eat, especially because of decay',
      frequency: 'mid',
      cet6Importance: 'mid',
      usageNote: '主语是食物本身，常与 go off 同义；不用于人。',
      evidenceType: 'ai_inferred',
    },
  ],
};

function genericOverview(word: string) {
  return {
    wordBasic: {
      lemma: word,
      phonetic: '',
      pos: ['n.'],
      etymology: '（mock 数据）该词的词源说明在此占位。',
      semanticHistory: '（mock 数据）该词的历史演变说明在此占位。',
      coreMeaning: '（mock 数据）核心意义占位。',
      coreMeaningNote: '（mock 数据）核心意义说明占位。',
      evidenceType: 'ai_inferred',
    },
    senses: [
      {
        senseNo: 1,
        pos: 'n.',
        cnGloss: '（mock）义项一',
        enDefinition: '(mock) A placeholder definition for the first sense.',
        frequency: 'high',
        cet6Importance: 'high',
        usageNote: '（mock）使用提示占位。',
        evidenceType: 'ai_inferred',
      },
    ],
  };
}

export function mockReanalyzePayload(
  payload: Record<string, unknown>,
  comment: string,
): { payload: Record<string, unknown>; changeNote: string } {
  const clone = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const marker = `（已按驳回意见修订：${comment.trim().slice(0, 40) || '补充说明'}）`;
  const stringKeys = [
    'conceptCn',
    'etymology',
    'boundary',
    'enDefinition',
    'usageNote',
    'coreMeaning',
    'cnContrast',
    'en',
    'difference',
    'usageCondition',
  ];
  for (const key of stringKeys) {
    if (typeof clone[key] === 'string' && (clone[key] as string).length > 0) {
      clone[key] = `${clone[key] as string}${marker}`;
      return { payload: clone, changeNote: `mock 修订：补充 ${key} 的说明` };
    }
  }
  return { payload: clone, changeNote: 'mock 修订：无可用文本字段' };
}

export function mockChatResponse(taskType: string, mockKey?: string): string {
  const baseType = taskType.replace(/\.repair$/, '');
  switch (baseType) {
    case 'connectivity_test':
      return JSON.stringify({ ok: true, reply: 'OK（mock）' });
    case 'word_overview':
      if (mockKey === 'suspend') return JSON.stringify(SUSPEND_OVERVIEW);
      if (mockKey === 'spoil') return JSON.stringify(SPOIL_OVERVIEW);
      return JSON.stringify(genericOverview(mockKey ?? 'word'));
    case 'sense_study':
      return JSON.stringify(senseStudy(mockKey ?? ''));
    case 'explain':
      return '（mock 回答）这里会用一句话解释该义项与相近表达的区别，并指出原内容中可能过度概括的地方。';
    case 'example_queries':
      return JSON.stringify({ queries: ['suspend all flights', 'suspend operations example'] });
    case 'example_extract':
      return JSON.stringify({
        examples: [
          {
            en: 'The airline decided to suspend all flights during the storm.',
            cn: '该航空公司在暴风雨期间决定暂停所有航班。',
            meaning: '航空公司作为主体正式决定暂停全部航班服务。',
            keyWords: ['suspend all flights'],
            collocationsInSentence: ['suspend all flights'],
            sourceUrl: 'https://www.bbc.com/news/mock-article',
            sourceTitle: 'BBC News — Airline cancels flights',
            sourceType: 'news',
            note: null,
          },
        ],
      });
    default:
      throw new Error(`mock 模式缺少任务样例: ${baseType}`);
  }
}

function senseStudy(key: string): unknown {
  const [lemma, senseNoText] = key.split('#');
  const senseNo = Number(senseNoText || '1');

  const conceptBySense: Record<number, Record<string, unknown>> = {
    1: {
      conceptCn:
        '这个义项表达的是：某个拥有权威的一方（政府、法院、公司、学校等）作出正式决定，使某项活动、服务或规则在一段时间内停止生效，而且隐含“之后可能恢复”的意思。它强调的不是“取消”，而是“暂时挂起”。',
      describedObject: '描述一种由制度性权威施加的、暂时性的中断状态，而不是动作本身的速度或强度。',
      scope:
        '适用于航班、比赛、营业、法令、谈判、支付等可以被正式中止的对象；主语通常是有权作出决定的机构或人。',
      boundary:
        '不适用于个人自行休息（用 take a break）；也不表示永久终止（用 terminate / abolish）。如果强调突然停止，用 halt 更自然。',
      misconceptions: [
        '误以为 suspend 等于 cancel：suspend 通常可以恢复，cancel 则是取消。',
        '误以为可以用于日常小事，如“暂停聊天”。',
      ],
      cnContrast:
        '中文“暂停”既可指个人动作也可指机构决定，而 suspend 更偏向正式、制度化的决定，语气更重，常见于新闻与法律文本。',
      grammarPatterns: ['suspend + 活动/服务/规则', 'suspend sth for + 时间段', 'be suspended pending + 名词（在……完成前暂停）'],
      scenarios: [
        '航空公司因极端天气宣布暂停所有航班。',
        '监管机构在调查期间暂停该公司的营业许可。',
        '两国在谈判破裂后暂停部分贸易协定。',
      ],
      evidenceType: 'ai_inferred',
    },
    2: {
      conceptCn:
        '这个义项是物理性的：把某物从上方固定或吊住，使其悬在空中、可以自由摆动。关键词是“悬挂点在上方”，而不是“放在某处”。',
      describedObject: '描述物体与支撑点之间的空间关系，以及由此形成的悬空状态。',
      scope: '用于吊灯、桥梁、缆车、绳索等物理对象。',
      boundary: '不表示“放置”（put）或“支撑”（support）；也不用于抽象事物。',
      misconceptions: ['误以为可以用主动结构随意搭配，其实最常见的是 be suspended from。'],
      cnContrast: '中文“悬挂”同样强调上方固定，但英文常用被动结构并强制使用介词 from 引出悬挂点。',
      grammarPatterns: ['be suspended from + 悬挂点', 'suspend sth from sth'],
      scenarios: ['吊灯悬挂在天花板上。', '缆车悬在河谷上方。'],
      evidenceType: 'ai_inferred',
    },
    3: {
      conceptCn:
        '这个义项指某人在一段时间内被暂时剥夺某种制度性身份或资格（职务、学籍、参赛资格），通常因为惩罚或正在接受调查；结束后可能恢复。',
      describedObject: '描述一种制度性制裁状态，而不是普通的“让某人离开”。',
      scope: '适用于员工、学生、运动员、官员等具有明确身份与规则约束的人。',
      boundary: '不用于没有制度身份的对象；也不等于解雇（dismiss）或开除（expel）。',
      misconceptions: ['误以为 suspend 表示“让人休息”，其实它带有惩罚或调查含义。'],
      cnContrast: '中文“停职”“停学”“停赛”各自有专门说法，英文用一个 suspend 加介词/语境区分。',
      grammarPatterns: ['suspend sb from + 职位/学校/比赛', 'be suspended for + 时间段'],
      scenarios: ['球员因违规被停赛三场。', '教师因调查被暂时停职。'],
      evidenceType: 'ai_inferred',
    },
  };

  const concept = conceptBySense[senseNo] ?? conceptBySense[1];

  return {
    concept,
    history: {
      origin: '源自拉丁语 suspendere：sub-（在下方）+ pendere（悬挂、称量）。',
      development:
        senseNo === 2
          ? '“悬挂”是最接近字面意义的用法，直接继承拉丁语的空间含义。'
          : '由“挂起来、悬而不落”发展出“使某事悬置、暂缓生效”，再进一步制度化，用于职位、资格与法令。',
      relations:
        senseNo === 2
          ? '与其他义项共享同一空间意象，但语义上保持具体，未进一步抽象化。'
          : '与“悬挂”义共享“悬置”的意象，属于从具体空间关系到抽象制度状态的隐喻扩展。',
      notableShifts:
        senseNo === 1
          ? ['“悬挂” → “悬而未决” → “正式中止”：从空间到制度的隐喻扩展。']
          : [],
      certaintyNote: '具体历史文献依据未逐条核对，属于词源学通行解释。',
      evidenceType: 'ai_inferred',
    },
    examples: [
      {
        en:
          senseNo === 1
            ? 'The airline was forced to suspend all flights because of the typhoon.'
            : senseNo === 2
              ? 'A single lamp was suspended from the ceiling above the table.'
              : 'The player was suspended for three matches after the incident.',
        cn:
          senseNo === 1
            ? '由于台风，该航空公司被迫暂停所有航班。'
            : senseNo === 2
              ? '一盏灯悬挂在桌子上方的天花板上。'
              : '事件发生后，这名球员被停赛三场。',
        meaning:
          senseNo === 1
            ? '机构作出正式决定，使航班服务暂时停止，之后可能恢复。'
            : senseNo === 2
              ? '描述灯具与天花板之间的悬挂关系。'
              : '因违规行为被暂时剥夺参赛资格。',
        keyWords: senseNo === 1 ? ['suspend flights', 'be forced to'] : ['suspend from'],
        collocationsInSentence: senseNo === 1 ? ['suspend all flights'] : [],
        sourceType: 'ai',
        sourceTitle: null,
        sourceUrl: null,
        sourceVerified: false,
        evidenceType: 'ai_inferred',
        note: 'AI生成例句，来源待核实',
      },
      {
        en:
          senseNo === 1
            ? 'Trading in the company’s shares was suspended pending an investigation.'
            : senseNo === 2
              ? 'The bridge is suspended from two massive towers.'
              : 'She was suspended from her duties while the complaint was investigated.',
        cn:
          senseNo === 1
            ? '在调查完成前，该公司股票的交易被暂停。'
            : senseNo === 2
              ? '这座桥由两座巨大的桥塔悬吊。'
              : '在投诉被调查期间，她被暂时停职。',
        meaning:
          senseNo === 1
            ? '正式暂停交易，等待调查结果，隐含可能恢复。'
            : senseNo === 2
              ? '描述桥体由桥塔悬吊的结构关系。'
              : '制度性停职，等待调查结论。',
        keyWords: senseNo === 1 ? ['pending an investigation'] : ['be suspended from'],
        collocationsInSentence: senseNo === 1 ? ['be suspended pending'] : [],
        sourceType: 'ai',
        sourceTitle: null,
        sourceUrl: null,
        sourceVerified: false,
        evidenceType: 'ai_inferred',
        note: 'AI生成例句，来源待核实',
      },
      {
        en:
          senseNo === 1
            ? 'The court suspended the sentence for two years.'
            : senseNo === 2
              ? 'Dust particles remained suspended in the air.'
              : 'Two officials were suspended over the corruption scandal.',
        cn:
          senseNo === 1
            ? '法院判处缓刑两年（暂缓执行）。'
            : senseNo === 2
              ? '尘埃颗粒悬浮在空气中。'
              : '两名官员因腐败丑闻被停职。',
        meaning:
          senseNo === 1
            ? '法院决定暂缓执行判决，属于制度化的“悬置”。'
            : senseNo === 2
              ? '描述微粒在空气中保持悬浮状态。'
              : '因丑闻被制度性停职。',
        keyWords: senseNo === 1 ? ['suspend the sentence'] : ['suspended in'],
        collocationsInSentence: [],
        sourceType: 'ai',
        sourceTitle: null,
        sourceUrl: null,
        sourceVerified: false,
        evidenceType: 'ai_inferred',
        note: 'AI生成例句，来源待核实',
      },
    ],
    collocations: [
      {
        phrase: senseNo === 2 ? 'be suspended from' : 'suspend sth pending sth',
        cn: senseNo === 2 ? '悬挂于（某处）' : '在某事完成前暂停某事',
        grammar: senseNo === 2 ? 'be + suspended + from + 名词' : 'suspend + 宾语 + pending + 名词',
        usageCondition:
          senseNo === 2
            ? '用于描述物体由上方悬吊，from 后接悬挂点。'
            : '用于正式语境，说明暂停是为了等待调查或决定。',
        exampleEn:
          senseNo === 2
            ? 'The chandelier is suspended from the ceiling.'
            : 'The licence was suspended pending a full review.',
        exampleCn:
          senseNo === 2 ? '吊灯悬挂在天花板上。' : '该执照在全面审查完成前被暂停。',
        sourceType: 'ai',
        sourceTitle: null,
        sourceUrl: null,
        evidenceType: 'ai_inferred',
      },
      {
        phrase: senseNo === 3 ? 'be suspended for + 时间段' : 'suspend operations',
        cn: senseNo === 3 ? '被停赛/停职一段时间' : '暂停运营',
        grammar: senseNo === 3 ? 'be + suspended + for + 时间' : 'suspend + operations',
        usageCondition:
          senseNo === 3 ? '说明制裁持续的时间长度，常与比赛、学籍相关。' : '用于公司、工厂、机构停止业务活动。',
        exampleEn:
          senseNo === 3
            ? 'He was suspended for two weeks without pay.'
            : 'The factory suspended operations during the inspection.',
        exampleCn:
          senseNo === 3 ? '他被无薪停职两周。' : '工厂在检查期间暂停了运营。',
        sourceType: 'ai',
        sourceTitle: null,
        sourceUrl: null,
        evidenceType: 'ai_inferred',
      },
    ],
    synonyms: [
      {
        word: 'halt',
        coreMeaning: '使（进行中的活动）停止',
        shared: '都表示使某项活动停下来',
        difference: 'halt 强调突然、彻底地停止，不隐含之后恢复；suspend 强调制度化、暂时性。',
        usageScene: '紧急叫停生产、进攻、谈判',
        interchangeable: false,
        notInterchangeableWhen: '表示“因调查而暂时停止”时不宜用 halt。',
        evidenceType: 'ai_inferred',
      },
      {
        word: 'pause',
        coreMeaning: '暂停一会儿再继续',
        shared: '都包含“暂时”的含义',
        difference: 'pause 更口语化，多用于个人动作或短暂停顿；suspend 是正式决定。',
        usageScene: '暂停视频、暂停讲话',
        interchangeable: false,
        notInterchangeableWhen: '描述机构正式暂停服务时，用 pause 会显得不正式。',
        evidenceType: 'ai_inferred',
      },
    ],
    antonyms: [
      {
        word: 'resume',
        coreMeaning: '（中断后）重新开始',
        opposition: '一个使活动停止，一个使活动恢复',
        difference: 'resume 隐含此前已经暂停；suspend 是暂停动作本身。',
        typicalScene: '恢复航班、恢复谈判',
        isDirect: true,
        evidenceType: 'ai_inferred',
      },
    ],
  };
}
