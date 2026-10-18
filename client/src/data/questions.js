/** 教学专项练习题库（小学语文/英语精选示例）
 *  - 每题都带 q.id / 正确答案 / 解析（屏幕练习 + 试卷解析均用）
 *  - 题目覆盖 3-4 年级常见考点，质量优先而非堆量
 *  - 题目数据后续可由后端 /api/questions 接口替换，组件不依赖具体来源
 *  - 每题统一带 grade（适用年级）/ difficulty（难度：easy/medium/hard）/ topic（主题关键词）
 */
/* 给题库统一加元信息（年级/难度/主题） */
const enrich = (arr, grade, difficulty, topic) =>
  arr.map(q => ({ ...q, grade, difficulty, topic }));

export const dictationQuestions = enrich([
  { id: 'd1', word: 'chén sī yuǎn', pinyin: 'chén sī yuǎn', answer: '陈思远', explanation: '常见人名，三个字均为左右结构，注意"思"半包围、"远"半包围。' },
  { id: 'd2', word: 'lǐ mù chén', answer: '李沐宸', explanation: '"沐"为左右结构三点水，"宸"为宝盖头加辰。' },
  { id: 'd3', word: 'wáng zǐ hán', answer: '王梓涵', explanation: '"梓"为木字旁加辛，"涵"为三点水加函。' },
  { id: 'd4', word: 'zhào xīn yí', answer: '赵欣怡', explanation: '"欣"为左右结构斤旁，"怡"为竖心旁加台。' },
  { id: 'd5', word: 'liú zǐ mò', answer: '刘子墨', explanation: '"墨"为黑加土，注意笔顺：黑、土。' },
  { id: 'd6', word: 'sūn yì hán', answer: '孙艺涵', explanation: '"艺"简化字横竖撇捺；"涵"易与"函"混淆。' },
  { id: 'd7', word: 'zhōu yǔ tóng', answer: '周雨桐', explanation: '"雨"为独体字，"桐"为木字旁加同。' },
  { id: 'd8', word: 'wú hào rán', answer: '吴浩然', explanation: '"浩"为三点水加告，"然"为左右结构。' },
  { id: 'd9', word: 'zhèng hǎo', answer: '郑好', explanation: '二字词，"好"为女子+子，简单字。' },
  { id: 'd10', word: 'lín yī nuò', answer: '林一诺', explanation: '"诺"为言字旁加若，常与"言"字头易混。' },
  { id: 'd11', word: 'huáng jǐng xíng', answer: '黄景行', explanation: '"景"日字旁加京，"行"多音字：行走(háng)/行动(xíng)。' },
  { id: 'd12', word: 'xú ruò xī', answer: '徐若曦', explanation: '"若"草字头加右，"曦"为日字旁加羲，常误写为"西"。' },
], 3, 'medium', '人名识字');

export const pinyinQuestions = enrich([
  { id: 'p1', pinyin: 'chuán shāo', answer: '传 烧', explanation: '"chuán"为"传"（传递）；"shāo"为"烧"（燃烧），注意翘舌音。' },
  { id: 'p2', pinyin: 'chì bǎng', answer: '翅膀', explanation: '翘舌音+后鼻音："chì bǎng"。' },
  { id: 'p3', pinyin: 'fǔ lǎn', answer: '俯瞰', explanation: '"fǔ"为"俯"（俯视）；"lǎn"为"瞰"（远望）。' },
  { id: 'p4', pinyin: 'qīng cuì', answer: '清脆', explanation: '一声+四声，常见叠词形容词。' },
  { id: 'p5', pinyin: 'xuán yá', answer: '悬崖', explanation: '"xuán"二声为"悬"；"yá"二声为"崖"（山字旁）。' },
  { id: 'p6', pinyin: 'wēi é', answer: '巍峨', explanation: '形容山势高峻，"巍"山字底加韦，"峨"山字旁加我。' },
  { id: 'p7', pinyin: 'dǒu qiào', answer: '陡峭', explanation: '"dǒu"为"陡"（坡度大）；"qiào"为"峭"（山字旁加肖）。' },
  { id: 'p8', pinyin: 'mián mián', answer: '绵绵', explanation: 'AABB 式叠词，注意两个"绵"字。' },
  { id: 'p9', pinyin: 'xiāo shēng', answer: '萧瑟 / 消声', explanation: '本题为多音字：xiāo 可对应"萧"（萧瑟）或"消"（消声）。' },
  { id: 'p10', pinyin: 'fēn fāng', answer: '芬芳', explanation: '叠韵词，形容花香。' },
  { id: 'p11', pinyin: 'gān jú', answer: '柑橘', explanation: '常见水果名，"橘"为木字旁加局。' },
  { id: 'p12', pinyin: 'lǎn duó', answer: '懒惰', explanation: '"lǎn"为"懒"（心旁）；"duò"为"惰"（心旁）。' },
], 3, 'medium', '拼音辨析');

export const fixQuestions = enrich([
  { id: 'f1', sentence: '我们要发扬一切优点和缺点,争取更大的进步。', answer: '我们要发扬一切优点,克服一切缺点,争取更大的进步。', explanation: '"发扬"只能搭配优点，"缺点"应改为"克服"，动宾搭配不当。', difficulty: 'easy' },
  { id: 'f2', sentence: '看了这本书,很受教育。', answer: '看了这本书,我很受教育。', explanation: '缺少主语，应在前半句加"我"或"他"，避免"悬垂分句"。', difficulty: 'easy' },
  { id: 'f3', sentence: '今天下午我们班全体同学都参加了文艺演出,只有小红没来。', answer: '今天下午我们班同学参加了文艺演出,只有小红没来。', explanation: '前后矛盾："全体同学都参加"与"小红没来"冲突，删除"全体"或"都"。', difficulty: 'medium' },
  { id: 'f4', sentence: '通过这次活动,使我学到了很多。', answer: '这次活动使我学到了很多。', explanation: '主语残缺：介词"通过"使主语消失，删除"通过"或加"我"。', difficulty: 'medium' },
  { id: 'f5', sentence: '他穿着一件灰色的大衣和一顶帽子。', answer: '他穿着一件灰色的大衣,戴着一顶帽子。', explanation: '"穿"与"戴"搭配对象不同，应分开表述。', difficulty: 'medium' },
  { id: 'f6', sentence: '我们要尽可能地节约不必要的浪费。', answer: '我们要尽可能地避免不必要的浪费。', explanation: '前后矛盾：节约与浪费不应同时搭配"不必要的"，应改为"避免浪费"。', difficulty: 'hard' },
  { id: 'f7', sentence: '春天的北京是一年中最美丽的季节。', answer: '北京的春天是一年中最美丽的季节。', explanation: '主语与宾语不匹配："北京"不是"季节"，应改为"北京的春天"。', difficulty: 'hard' },
  { id: 'f8', sentence: '小明不仅学习好,而且思想也好,同学们都很夸他。', answer: '小明不仅学习好,而且思想也好,同学们都很赞赏他。', explanation: '"夸"为口语，改为书面语"赞扬/赞赏"更准确。', difficulty: 'hard' },
  { id: 'f9', sentence: '大约两点钟左右,他才赶到会场。', answer: '大约两点钟,他才赶到会场。', explanation: '"大约"与"左右"语义重复，删除其一。', difficulty: 'medium' },
  { id: 'f10', sentence: '看到这张照片,我想起了自己过去的往事。', answer: '看到这张照片,我想起了自己过去的经历。', explanation: '语义重复："过去的"与"往"重复，删除"过去的"或改"往事"为"经历"。', difficulty: 'hard' },
], 4, 'medium', '病句辨析');

export const sentenceFillQuestions = enrich([
  { id: 's1', sentence: 'I ___ to school every day.', answer: 'go', explanation: '一般现在时，主语 I + 动词原形。', hint: '常用动词', difficulty: 'easy' },
  { id: 's2', sentence: 'She ___ a beautiful song now.', answer: 'is singing', explanation: 'now 提示进行时：主语 + be + V-ing。', hint: 'sing', difficulty: 'easy' },
  { id: 's3', sentence: 'They ___ in the park yesterday.', answer: 'were', explanation: 'yesterday 提示过去时，they 用 were。', hint: 'be 动词', difficulty: 'easy' },
  { id: 's4', sentence: 'There ___ four apples on the table.', answer: 'are', explanation: '复数名词用 are。', hint: 'be 动词', difficulty: 'easy' },
  { id: 's5', sentence: 'He ___ his homework already.', answer: 'has finished', explanation: 'already 提示现在完成时：has + 过去分词。', hint: 'finish', difficulty: 'medium' },
  { id: 's6', sentence: 'I ___ like apples, but I like bananas.', answer: 'don\'t', explanation: '否定句用 don\'t / doesn\'t。', hint: '助动词', difficulty: 'medium' },
  { id: 's7', sentence: '___ you like some tea?', answer: 'Would', explanation: '委婉请求用 Would you like...?nWould + like。', hint: '情态动词', difficulty: 'medium' },
  { id: 's8', sentence: 'The book ___ on the desk is mine.', answer: 'lying', explanation: '现在分词短语作后置定语：lying on the desk。', hint: 'lie 的现在分词', difficulty: 'hard' },
  { id: 's9', sentence: 'We will go out if it ___ tomorrow.', answer: 'is fine', explanation: '主将从现：主句将来时，从句一般现在时。', hint: '天气', difficulty: 'medium' },
  { id: 's10', sentence: 'I am ___ than my brother.', answer: 'taller', explanation: '比较级：tall → taller（结尾加 er）。', hint: 'tall', difficulty: 'easy' },
  { id: 's11', sentence: 'My mother told me ___ hard.', answer: 'to study', explanation: 'tell sb. to do sth. 句式。', hint: 'study', difficulty: 'medium' },
  { id: 's12', sentence: 'This is the ___ book I have ever read.', answer: 'most interesting', explanation: '最高级：the + most + 形容词。', hint: 'interesting', difficulty: 'hard' },
], 4, 'medium', '时态语法');

export const wordbankQuestions = enrich([
  { id: 'w1', passage: 'Tom ____1____ a pupil. He ____2____ to school every day. He likes ____3____ books after school.', choices: ['is', 'goes', 'reading', 'runs', 'are', 'going'], blanks: [{ index: 0, answer: 'is' }, { index: 1, answer: 'goes' }, { index: 2, answer: 'reading' }], explanation: '① 主语 He + is；② 一般现在时：goes；③ like + V-ing：reading。', difficulty: 'medium' },
  { id: 'w2', passage: 'I ____1____ a new bike yesterday. It ____2____ my father ____3____ me.', choices: ['bought', 'is', 'gave', 'buy', 'was', 'gives'], blanks: [{ index: 0, answer: 'bought' }, { index: 1, answer: 'was' }, { index: 2, answer: 'gave' }], explanation: 'yesterday 提示过去时：bought / was / gave。', difficulty: 'medium' },
  { id: 'w3', passage: 'There ____1____ a cat and two dogs in the picture. The cat ____2____ on the chair, the dogs ____3____ under it.', choices: ['are', 'is', 'sit', 'sits', 'sleeping', 'sitting'], blanks: [{ index: 0, answer: 'is' }, { index: 1, answer: 'is sitting' }, { index: 2, answer: 'are sitting' }], explanation: '单数用 is，复数用 are；sit 的现在分词为 sitting。', difficulty: 'medium' },
  { id: 'w4', passage: 'My sister is ____1____ than me. She is the ____2____ in our family.', choices: ['older', 'tallest', 'taller', 'shortest', 'youngest', 'older'], blanks: [{ index: 0, answer: 'older' }, { index: 1, answer: 'tallest' }], explanation: '① 比较级 older；② 最高级 the tallest。', difficulty: 'easy' },
  { id: 'w5', passage: 'If it ____1____ tomorrow, we ____2____ stay at home. We can ____3____ books.', choices: ['rains', 'will', 'read', 'rainy', 'would', 'reading'], blanks: [{ index: 0, answer: 'rains' }, { index: 1, answer: 'will' }, { index: 2, answer: 'read' }], explanation: '主将从现：if 从句一般现在时 rains；主句将来时 will + 动词原形 read。', difficulty: 'hard' },
  { id: 'w6', passage: 'I have ____1____ this book for two days. It is very ____2____, and I ____3____ it very much.', choices: ['read', 'interesting', 'like', 'keep', 'interested', 'likes'], blanks: [{ index: 0, answer: 'read' }, { index: 1, answer: 'interesting' }, { index: 2, answer: 'like' }], explanation: '现在完成时 have read；事物令人有趣用 interesting；主语 I 用 like。', difficulty: 'hard' },
  { id: 'w7', passage: 'Look! The children ____1____ in the park. Some are ____2____ kites, others are ____3____ songs.', choices: ['are playing', 'flying', 'singing', 'play', 'fly', 'sing'], blanks: [{ index: 0, answer: 'are playing' }, { index: 1, answer: 'flying' }, { index: 2, answer: 'singing' }], explanation: 'Look! 提示现在进行时 are playing / flying / singing。', difficulty: 'medium' },
  { id: 'w8', passage: 'I am going to be a ____1____ when I grow up. I want to ____2____ sick people and ____3____ them.', choices: ['doctor', 'help', 'save', 'teacher', 'helps', 'teach'], blanks: [{ index: 0, answer: 'doctor' }, { index: 1, answer: 'help' }, { index: 2, answer: 'save' }], explanation: 'want to + 动词原形：help / save。', difficulty: 'medium' },
  { id: 'w9', passage: 'There is a small ____1____ near my home. The water in it is very ____2____. We often ____3____ there on Sundays.', choices: ['river', 'clean', 'swim', 'lake', 'clear', 'go'], blanks: [{ index: 0, answer: 'river' }, { index: 1, answer: 'clean' }, { index: 2, answer: 'go' }], explanation: 'a small river；水很 clean / clear（清水）；we often go there 搭配自然。', difficulty: 'medium' },
  { id: 'w10', passage: 'Lily ____1____ her keys in her room just now. She ____2____ find them. Could you help her ____3____ them?', choices: ['lost', 'can\'t', 'find', 'loses', 'can', 'found'], blanks: [{ index: 0, answer: 'lost' }, { index: 1, answer: 'can\'t' }, { index: 2, answer: 'find' }], explanation: 'just now 提示过去时 lost；can\'t 否定；help sb. do 用动词原形 find。', difficulty: 'hard' },
], 4, 'medium', '综合运用');

/** 题型 → 完整题库（配置面板用） */
export const POOL = {
  dictation: dictationQuestions,
  pinyin: pinyinQuestions,
  fix: fixQuestions,
  sentence: sentenceFillQuestions,
  wordbank: wordbankQuestions,
};

/** 后续接 AI：把题库函数包装成异步，目前为本地快速返回 */
export async function loadQuestions(subject, type) {
  // 占位接入点：未来改为 fetch(`/api/questions?subject=${subject}&type=${type}&...`)
  return POOL[type] || [];
}
