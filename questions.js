const QUESTIONS = [
  {
    "category": "judgment",
    "original_num": 1,
    "question": "$n$ 个命题变元一共可以构造 $2^n$ 个不同的极小项。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "$n$ 个命题变元共有 $2^n$ 种不同的真值组合，每种组合对应一个极小项，因此一共可以构造 $2^n$ 个不同的极小项。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 2,
    "question": "0 元谓词一定是命题。（ ）",
    "options": [],
    "answer": "错",
    "analysis": "严格来说，在谓词逻辑的语法层面，0元谓词只是一个谓词符号，在没有给定解释（Interpretation）之前它无法判断真假。只有在给定解释的语义层面，它才等价于一个确定真值的命题。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 3,
    "question": "永真式的命题公式的任何代替实例仍然是永真式。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "根据替换定理，用任何命题公式替换永真式中的命题变元，所得到的新的命题公式依然是永真式。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 4,
    "question": "$A$ 和 $B$ 是两个谓词公式，如果在任何解释下，$A$ 和 $B$ 都有相同的真值，则 $A$ 和 $B$ 等价。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "这符合谓词逻辑中公式等价（或同真）的定义。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 5,
    "question": "“$\\sqrt{2}$ 是无理数。”是命题。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "该句子是一个陈述句，并且其客观真值为“真”，能够判断真假，因此是命题。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "judgment",
    "original_num": 6,
    "question": "可满足式可分为：永真式和非永真式的可满足式。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "公式如果在至少一个解释下为真，就是可满足式。这其中包括在所有解释下都为真的“永真式”，以及仅在部分解释下为真的“非永真式的可满足式”。",
    "topic": "predicate_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "judgment",
    "original_num": 7,
    "question": "$A$ 为永假式当且仅当 $A$ 与 0 等价。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "永假式在任何解释下的真值都为 0（假），因此它与常数 0 逻辑等价。",
    "topic": "predicate_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "judgment",
    "original_num": 8,
    "question": "$A$ 为永真式当且仅当 $A$ 与 1 等价。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "永真式在任何解释下的真值都为 1（真），因此它与常数 1 逻辑等价。",
    "topic": "predicate_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "judgment",
    "original_num": 9,
    "question": "封闭的谓词公式是只有约束变元而没有自由变元的谓词公式。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "闭式（封闭公式）的定义就是不含有任何自由变元的谓词公式。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 10,
    "question": "在谓词公式 $\\forall x A$ 和 $\\exists x A$ 中，$x$ 为指导变元。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "紧跟在量词 $\\forall$ 或 $\\exists$ 后面的变元 $x$ 被称为指导变元（或作用变元）。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 11,
    "question": "$A$ 和 $B$ 是两个谓词公式，如果在任何解释下，$A$ 和 $B$ 都有相同的真值，则 $A$ 和 $B$ 等价。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "此题与第 4 题完全重复，结论相同。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 12,
    "question": "谓词是表示个体词性质或个体词之间相互关系的词。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "这是一阶逻辑中谓词的经典定义：一元谓词表示性质，多元谓词表示个体间的关系。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "judgment",
    "original_num": 13,
    "question": "设 $A$、$B$ 是两个谓词公式，则 $A \\Leftrightarrow B$ 也是谓词公式。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "根据谓词公式的合式公式（WFF）的双条件连接词复合定义，它依然是合法的谓词公式。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "judgment",
    "original_num": 14,
    "question": "设 $A$、$B$ 是两个谓词公式，则 $A \\Rightarrow B$ 也是谓词公式。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "根据谓词公式的合式公式（WFF）的条件连接词复合定义，它依然是合法的谓词公式。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "judgment",
    "original_num": 15,
    "question": "闭式在任何解释下都能成为命题。（ ）",
    "options": [],
    "answer": "对",
    "analysis": "因为闭式（封闭公式）中不含有任何自由变元，一旦给定了解释（确定了全称域及谓词的具体含义），它的真值就完全唯一确定了，因此在任何解释下都能成为一个命题。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 1,
    "question": "下列选项中，（ ）不是命题。",
    "options": [
      {
        "key": "A",
        "text": "天气好热啊！"
      },
      {
        "key": "B",
        "text": "后天是阴天。"
      },
      {
        "key": "C",
        "text": "2是偶数。"
      },
      {
        "key": "D",
        "text": "地球是方的。"
      }
    ],
    "answer": "A",
    "analysis": "命题必须是能够判断真假的陈述句。A选项是感叹句，不能判断真假，所以不是命题。B、C、D均为陈述句（无论对错），都是命题。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 2,
    "question": "设 $p$：张晓静爱唱歌，$q$：张晓静爱听音乐，则“张晓静爱唱歌或爱听音乐”可符号化为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$p \\wedge q$"
      },
      {
        "key": "B",
        "text": "$p \\vee q$"
      },
      {
        "key": "C",
        "text": "$\\neg p$"
      },
      {
        "key": "D",
        "text": "$\\neg p \\wedge q$"
      }
    ],
    "answer": "B",
    "analysis": "自然语言中的联结词“或”对应逻辑中的析取联结词（$\\vee$），因此符号化为 $p \\vee q$。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "single_choice",
    "original_num": 3,
    "question": "设 $p$：吴颖用功，$q$：吴颖聪明，则“吴颖虽然聪明，但不用功。”可表示为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$p \\wedge q$"
      },
      {
        "key": "B",
        "text": "$p \\vee q$"
      },
      {
        "key": "C",
        "text": "$q \\wedge \\neg p$"
      },
      {
        "key": "D",
        "text": "$\\neg p$"
      }
    ],
    "answer": "C",
    "analysis": "“虽然……但……”在逻辑上表达的是两件事同时发生，属于合取关系（$\\wedge$）。“聪明”对应 $q$，“不用功”对应 $\\neg p$，组合起来即为 $q \\wedge \\neg p$。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 4,
    "question": "下列选项中，（ ）不是复合命题。",
    "options": [
      {
        "key": "A",
        "text": "张辉与王丽都是三好生"
      },
      {
        "key": "B",
        "text": "张辉与王丽是同学"
      },
      {
        "key": "C",
        "text": "张辉虽然聪明，但不用功。"
      },
      {
        "key": "D",
        "text": "王丽不仅用功而且聪明"
      }
    ],
    "answer": "B",
    "analysis": "A项可拆分为“张辉是三好生”且“王丽是三好生”；C项和D项明显含有联结词关系。而B项中的“是同学”体现的是张辉和王丽之间的一种社会“关系”，无法拆分为两个独立的原子命题，属于简单命题（原子命题）。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "single_choice",
    "original_num": 5,
    "question": "以下选项中，（ ）符合从左（高）到右（低）的优先级顺序。",
    "options": [
      {
        "key": "A",
        "text": "$\\rightarrow, (), \\neg, \\wedge, \\vee, \\leftrightarrow$"
      },
      {
        "key": "B",
        "text": "$(), \\neg, \\leftrightarrow, \\wedge, \\vee, \\rightarrow$"
      },
      {
        "key": "C",
        "text": "$\\neg, \\wedge, \\vee, \\rightarrow, \\leftrightarrow, ()$"
      },
      {
        "key": "D",
        "text": "$(), \\neg, \\wedge, \\vee, \\rightarrow, \\leftrightarrow$"
      }
    ],
    "answer": "D",
    "analysis": "数理逻辑中常规的运算符优先级从高到低依次为：括号 $() >$ 否定 $\\neg >$ 合取 $\\wedge >$ 析取 $\\vee >$ 条件 $\\rightarrow >$ 双条件 $\\leftrightarrow$。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 6,
    "question": "公式 $(\\neg p \\wedge q) \\rightarrow \\neg r$ 为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "永真式"
      },
      {
        "key": "B",
        "text": "永假式"
      },
      {
        "key": "C",
        "text": "非永真式的可满足式"
      },
      {
        "key": "D",
        "text": "0"
      }
    ],
    "answer": "C",
    "analysis": "当 $p=0, q=1, r=1$ 时，前件为 1 后件为 0，公式为 0；当 $p=0, q=0, r=0$ 时，前件为 0 后件为 1，公式为 1。因此它既能取 1 也能取 0，属于非永真式的可满足式。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 7,
    "question": "含有 3 个命题变项的命题公式 $G(p, q, r)$ 的赋值个数为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "1"
      },
      {
        "key": "B",
        "text": "2"
      },
      {
        "key": "C",
        "text": "4"
      },
      {
        "key": "D",
        "text": "8"
      }
    ],
    "answer": "D",
    "analysis": "3个独立的二进制命题变元，其真值组合共有 $2^3 = 8$ 种，即有 8 个赋值。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 8,
    "question": "$A$ 与（ ）公式等价。",
    "options": [
      {
        "key": "A",
        "text": "$A \\wedge (A \\vee B)$"
      },
      {
        "key": "B",
        "text": "$A \\vee (A \\vee B)$"
      },
      {
        "key": "C",
        "text": "$A \\vee B$"
      },
      {
        "key": "D",
        "text": "$A \\wedge B$"
      }
    ],
    "answer": "A",
    "analysis": "根据吸收律，$A \\wedge (A \\vee B) \\Leftrightarrow A$。而 B 项化简后为 $A \\vee B$。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 9,
    "question": "以下不是极大/极小完备集的是（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$\\{\\neg, \\wedge\\}$"
      },
      {
        "key": "B",
        "text": "$\\{\\neg, \\vee\\}$"
      },
      {
        "key": "C",
        "text": "$\\{\\wedge, \\vee, \\rightarrow, \\leftrightarrow\\}$"
      },
      {
        "key": "D",
        "text": "$\\{\\uparrow\\}$"
      }
    ],
    "answer": "C",
    "analysis": "联结词完备集必须能够表示所有的命题公式。A、B是经典的双联结词完备集，D是谢弗竖线（与非），是单联结词完备集。C选项中缺少了“否定（$\\neg$）”功能，无法表达否定含义，因此不是完备集。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "single_choice",
    "original_num": 10,
    "question": "命题公式 $(\\neg p \\wedge q) \\rightarrow r$ 的成假赋值为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$p=0, q=0, r=0$"
      },
      {
        "key": "B",
        "text": "$p=0, q=1, r=0$"
      },
      {
        "key": "C",
        "text": "$p=0, q=0, r=1$"
      },
      {
        "key": "D",
        "text": "$p=1, q=0, r=1$"
      }
    ],
    "answer": "B",
    "analysis": "条件公式 $X \\rightarrow Y$ 为假的唯一情况是前件 $X=1$ 且后件 $Y=0$。要让 $\\neg p \\wedge q = 1$，必须 $\\neg p=1$ 且 $q=1$（即 $p=0, q=1$）；同时要求后件 $r=0$。所以成假赋值为 $p=0, q=1, r=0$。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 11,
    "question": "推理证明中的归谬法，需要引入的附加前提是（ ）。",
    "options": [
      {
        "key": "A",
        "text": "结论本身"
      },
      {
        "key": "B",
        "text": "结论的否定式"
      },
      {
        "key": "C",
        "text": "任意已知前提"
      },
      {
        "key": "D",
        "text": "结论的等价公式"
      }
    ],
    "answer": "B",
    "analysis": "归谬法（反证法）的核心思想是假设结论不成立，即将“结论的否定式”作为附加前提引入，从而推导出矛盾。",
    "topic": "propositional_logic",
    "sub_topic": "prop_deduction"
  },
  {
    "category": "single_choice",
    "original_num": 12,
    "question": "若某一命题公式只有一组解（成真赋值），则该公式的标准析取范式含有的极小项的个数为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "全部极大项"
      },
      {
        "key": "B",
        "text": "0"
      },
      {
        "key": "C",
        "text": "2"
      },
      {
        "key": "D",
        "text": "1"
      }
    ],
    "answer": "D",
    "analysis": "标准析取范式（主析取范式）中的每一个极小项都对应公式的一个成真赋值。因为只有一组对应成真，所以标准析取范式中只含有 1 个极小项。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "single_choice",
    "original_num": 13,
    "question": "设公式 $X$ 含命题变项 $p$、$q$ 和 $r$，$X$ 的标准合取范式为 $M_0 \\wedge M_2 \\wedge M_3 \\wedge M_5$，则 $X$ 的标准析取范式为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$m_0 \\vee m_2 \\vee m_3 \\vee m_5$"
      },
      {
        "key": "B",
        "text": "$m_0 \\wedge m_2 \\wedge m_3 \\wedge m_5$"
      },
      {
        "key": "C",
        "text": "$M_1 \\vee M_4 \\vee M_6 \\vee M_7$"
      },
      {
        "key": "D",
        "text": "$m_1 \\vee m_4 \\vee m_6 \\vee m_7$"
      }
    ],
    "answer": "D",
    "analysis": "主析取范式的极小项下标与主合取范式的极大项下标是互补的。3个变项的下标范围是 0~7。已知极大项下标为 0, 2, 3, 5，则极小项下标必然为剩下的 1, 4, 6, 7。因为要求的是【标准析取范式】（主析取范式），它是由极小项（用小写字母 m 表示）构成的析取式，即 $m_1 \\vee m_4 \\vee m_6 \\vee m_7$，因此选择 D。而选项 C 采用大写字母 M，代表的是极大项（主合取范式）。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 14,
    "question": "谓词公式 $\\exists x P(x) \\rightarrow \\forall y Q(y)$ 中关于变元描述正确的是（ ）。",
    "options": [
      {
        "key": "A",
        "text": "全为自由变元"
      },
      {
        "key": "B",
        "text": "$x$ 是自由变元，$y$ 是约束变元"
      },
      {
        "key": "C",
        "text": "全为约束变元"
      },
      {
        "key": "D",
        "text": "$x$ 是约束变元，$y$ 是自由变元"
      }
    ],
    "answer": "C",
    "analysis": "变元 $x$ 在量子 $\\exists x$ 的辖域内，是约束变元；变元 $y$ 在量词 $\\forall y$ 的辖域内，也是约束变元。故全为约束变元。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "single_choice",
    "original_num": 15,
    "question": "谓词公式 $\\forall x (P(x) \\vee R(y) \\rightarrow Q(x))$ 中 $y$ 是（ ）。",
    "options": [
      {
        "key": "A",
        "text": "自由变元"
      },
      {
        "key": "B",
        "text": "既是自由变元也是约束变元"
      },
      {
        "key": "C",
        "text": "约束变元"
      },
      {
        "key": "D",
        "text": "既不是自由变元也不是约束变元"
      }
    ],
    "answer": "A",
    "analysis": "量词为 $\\forall x$，其辖域管辖整个括号内的 $x$。变元 $y$ 在公式中出现，但没有任何关于 $y$ 的量词对其进行约束，因此 $y$ 是自由变元。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "single_choice",
    "original_num": 16,
    "question": "谓词公式 $\\forall x (P(x) \\vee \\exists y (R(y))) \\rightarrow Q(x)$ 中 $x$ 是（ ）。",
    "options": [
      {
        "key": "A",
        "text": "自由变元"
      },
      {
        "key": "B",
        "text": "既是自由变元也是约束变元"
      },
      {
        "key": "C",
        "text": "约束变元"
      },
      {
        "key": "D",
        "text": "既不是自由变元也不是约束变元"
      }
    ],
    "answer": "B",
    "analysis": "前项括号内的 $\\forall x(P(x) \\vee \\dots)$ 中，$x$ 受全称量词约束，是约束变元；而尾部的 $\\rightarrow Q(x)$ 已经脱离了该全称量词的辖域，这里的 $x$ 是自由变元。因此 $x$ 在该公式中既是自由变元也是约束变元。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "single_choice",
    "original_num": 17,
    "question": "若没有指明个体域，则使用（ ）个体域。",
    "options": [
      {
        "key": "A",
        "text": "自然数集合"
      },
      {
        "key": "B",
        "text": "实数集合"
      },
      {
        "key": "C",
        "text": "有限"
      },
      {
        "key": "D",
        "text": "全总"
      }
    ],
    "answer": "D",
    "analysis": "在谓词逻辑中，如果未对个体域做特殊说明，默认使用包含宇宙间一切客观存在的“全总个体域”（简称全总域）。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 18,
    "question": "下列等价式错误的是（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$\\forall x(A(x) \\vee B(x)) \\Leftrightarrow \\forall x A(x) \\vee \\forall x B(x)$"
      },
      {
        "key": "B",
        "text": "$A \\rightarrow \\forall x B(x) \\Leftrightarrow \\forall x(A \\rightarrow B(x))$"
      },
      {
        "key": "C",
        "text": "$\\exists x(A(x) \\vee B(x)) \\Leftrightarrow \\exists x A(x) \\vee \\exists x B(x)$"
      },
      {
        "key": "D",
        "text": "$\\neg \\forall x A(x) \\Leftrightarrow \\exists x(\\neg A(x))$"
      }
    ],
    "answer": "A",
    "analysis": "全称量词 $\\forall$ 对析取符号 $\\vee$ 没有分配律，即“所有人要么是男的要么是女的”并不等价于“所有人都是男的，或者所有人都是女的”。B项中 $A$ 不含 $x$ 变元可以自由进出量词辖域；C、D均为标准的谓词逻辑等价常识。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "single_choice",
    "original_num": 19,
    "question": "$(p \\rightarrow q) \\vee r$ 可用 $\\{\\neg, \\wedge\\}$ 表示为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$\\neg p \\wedge (\\neg q \\wedge \\neg r)$"
      },
      {
        "key": "B",
        "text": "$\\neg p \\wedge \\neg q \\wedge \\neg r$"
      },
      {
        "key": "C",
        "text": "$\\neg p \\vee q \\vee r$"
      },
      {
        "key": "D",
        "text": "$\\neg(p \\wedge \\neg q \\wedge \\neg r)$"
      }
    ],
    "answer": "D",
    "analysis": "$(p \\rightarrow q) \\vee r \\Leftrightarrow \\neg p \\vee q \\vee r$。为了仅用 $\\neg$ 和 $\\wedge$ 表示，利用德·摩根定律进行等价变换：$\\neg p \\vee q \\vee r \\Leftrightarrow \\neg(\\neg(\\neg p \\vee q \\vee r)) \\Leftrightarrow \\neg(p \\wedge \\neg q \\wedge \\neg r)$。因此选择 D。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 20,
    "question": "判断推理是否正确。（ ）\n若今天是 1 号，则明天是 5 号。明天是 5 号。所以，今天是 1 号。",
    "options": [
      {
        "key": "A",
        "text": "推理正确"
      },
      {
        "key": "B",
        "text": "推理不正确"
      },
      {
        "key": "C",
        "text": "无法判断"
      }
    ],
    "answer": "B",
    "analysis": "设 $p$：今天是1号，$q$：明天是5号。该推理结构为：$(p \\rightarrow q) \\wedge q \\Rightarrow p$。这犯了逻辑学中典型的“肯定后件”错误，是无效推理。",
    "topic": "propositional_logic",
    "sub_topic": "prop_deduction"
  },
  {
    "category": "single_choice",
    "original_num": 21,
    "question": "谓词公式 $\\neg(\\forall x P(x) \\rightarrow \\exists x \\forall y Q(x, y)) \\wedge \\exists x \\forall y Q(x, y)$ 类型为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "永真式"
      },
      {
        "key": "B",
        "text": "永假式"
      },
      {
        "key": "C",
        "text": "非永真的可满足式"
      }
    ],
    "answer": "B",
    "analysis": "令大公式左半部分的组件 $A = \\exists x \\forall y Q(x, y)$，则整个公式的后半段化简结构相当于 $\\neg(\\dots \\rightarrow A) \\wedge A$。根据条件联结词定义，要让前件 $\\neg(\\dots \\rightarrow A)$ 为真，必须要求 $A$ 为假。但此时后半部分的 $A$ 必须要为真。两者矛盾，公式永远为 0（假），所以是永假式。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "single_choice",
    "original_num": 22,
    "question": "若个体域 $D=\\{a, b\\}$，则 $\\forall x P(x) \\wedge \\exists x Q(x)$ 在 $D$ 中消去量词后应为（ ）。",
    "options": [
      {
        "key": "A",
        "text": "$P(x) \\wedge Q(x)$"
      },
      {
        "key": "B",
        "text": "$P(a) \\wedge P(b) \\wedge Q(a) \\vee Q(b)$"
      },
      {
        "key": "C",
        "text": "$P(a) \\wedge P(b)$"
      },
      {
        "key": "D",
        "text": "$P(a) \\wedge P(b) \\wedge (Q(a) \\vee Q(b))$"
      }
    ],
    "answer": "D",
    "analysis": "在有限个体域中，全称量词 $\\forall x P(x)$ 展开为合取项 $P(a) \\wedge P(b)$；存在量词 $\\exists x Q(x)$ 展开为析取项 $Q(a) \\vee Q(b)$。它们之间由 $\\wedge$ 连接，为了保证运算级不乱，必须为析取项加上括号，即 $(P(a) \\wedge P(b)) \\wedge (Q(a) \\vee Q(b))$。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "single_choice",
    "original_num": 23,
    "question": "下面错误的是（ ）。",
    "options": [
      {
        "key": "A",
        "text": "(1) $\\forall x(P(x) \\rightarrow Q(x))$ 推出 (2) $P(a) \\rightarrow Q(a)$"
      },
      {
        "key": "B",
        "text": "$\\forall x \\forall y P(x, y) \\Rightarrow \\exists y \\forall x P(x, y)$"
      },
      {
        "key": "C",
        "text": "$\\exists x \\forall y P(x, y) \\Leftrightarrow \\forall y \\exists x P(x, y)$"
      },
      {
        "key": "D",
        "text": "$\\exists y \\forall x P(x, y) \\Rightarrow \\forall x \\exists y P(x, y)$"
      }
    ],
    "answer": "C",
    "analysis": "C项中，左边意为“存在一个通用的 $x$，使得对所有 $y$ 都成立”；右边意为“对每一个 $y$，都能找到一个对应的 $x$ 成立”。左边能单向推出右边（即 $\\Rightarrow$），但反过来不成立，因此它们不是双向等价（$\\Leftrightarrow$）的关系。\n这里已为你将图片中后续的**填空题、计算题、证明题和应用题**完整提取，并严格按照你指定的排版与格式规范进行了整理。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "fill_blank",
    "original_num": 1,
    "question": "命题：e 是自然数。该命题否定式的真值为 ________ 。",
    "options": [],
    "answer": "1（或 真）",
    "analysis": "原命题“e是自然数”的真值为假（0），因此其否定式“e不是自然数”的真值为真（1）。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "fill_blank",
    "original_num": 2,
    "question": "谓词逻辑的三要素是 ________ 、 ________ 、 ________ 。",
    "options": [],
    "answer": "个体词 | 谓词 | 量词",
    "analysis": "无",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "fill_blank",
    "original_num": 3,
    "question": "命题公式的三种类型是 ________ 、 ________ 、 ________ 。",
    "options": [],
    "answer": "永真式 | 永假式 | 可满足式",
    "analysis": "无",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "fill_blank",
    "original_num": 4,
    "question": "命题逻辑中演绎推理的三个规则是 ________ 、 ________ 、 ________ 。",
    "options": [],
    "answer": "P规则 | T规则 | CP规则",
    "analysis": "P规则为前提引入规则，T规则为逻辑结果引入规则，CP规则为附加前提规则。",
    "topic": "propositional_logic",
    "sub_topic": "prop_deduction"
  },
  {
    "category": "fill_blank",
    "original_num": 5,
    "question": "$\\neg s$ 若用仅含 $\\downarrow$ 联结词来表达可表示为 ________ 。",
    "options": [],
    "answer": "$s \\downarrow s$",
    "analysis": "根据或非（$\\downarrow$）的定义，$s \\downarrow s \\Leftrightarrow \\neg(s \\vee s) \\Leftrightarrow \\neg s$。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "fill_blank",
    "original_num": 6,
    "question": "谓词逻辑中，永真式的代替实例为 ________ 。",
    "options": [],
    "answer": "永真式",
    "analysis": "根据替换定理，用任何谓词公式代替永真式中的命题变元，所得的公式依然是永真式。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "fill_blank",
    "original_num": 7,
    "question": "设 $G(x)$：$x$ 是人，$F(x)$：$x$ 喝水，则命题“有的人喝水”符号化为 ________ 。",
    "options": [],
    "answer": "$\\exists x(G(x) \\wedge F(x))$",
    "analysis": "“有的人”需要使用存在量词 $\\exists x$，存在量词性质常与合取联结词 $\\wedge$ 联用。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "fill_blank",
    "original_num": 8,
    "question": "假设命题公式 $G$ 含有两个命题变元，其标准析取范式为 $m_{00} \\vee m_{10}$，则其标准合取范式为 ________ 。",
    "options": [],
    "answer": "$M_{01} \\wedge M_{11}$",
    "analysis": "两变量的标准析取范式和标准合取范式的下标是互补的。已知极小项为 00 和 10，则极大的项为 01 和 11。",
    "topic": "predicate_logic",
    "sub_topic": "pred_formulas"
  },
  {
    "category": "fill_blank",
    "original_num": 9,
    "question": "每个极大项的成假赋值的个数为 ________ 。",
    "options": [],
    "answer": "1",
    "analysis": "每个极大项在所有的真值组合中，有且仅有一个赋值使其结果为假（0）。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "calculation",
    "original_num": 1,
    "question": "设 $p$：1+4=5，$q$：北京是中华人民共和国的首都，$r$：杭州电子科技大学在广州，求下列复合命题的真值。\n(1) $(p \\leftrightarrow q) \\rightarrow r$\n(2) $(r \\rightarrow (p \\wedge q)) \\leftrightarrow \\neg p$",
    "options": [],
    "answer": "(1) 0（或 假）\n(2) 0（或 假）",
    "analysis": "首先判断原子命题的真值：$p = 1$, $q = 1$, $r = 0$（杭电在杭州，不在广州）。\n(1) $(1 \\leftrightarrow 1) \\rightarrow 0 \\equiv 1 \\rightarrow 0 \\equiv 0$。\n(2) $(0 \\rightarrow (1 \\wedge 1)) \\leftrightarrow \\neg 1 \\equiv (0 \\rightarrow 1) \\leftrightarrow 0 \\equiv 1 \\leftrightarrow 0 \\equiv 0$。",
    "topic": "propositional_logic",
    "sub_topic": "prop_formulas"
  },
  {
    "category": "calculation",
    "original_num": 2,
    "question": "用真值表判断公式 $(p \\rightarrow \\neg p) \\rightarrow \\neg q$ 的类型并利用真值表法写出该公式的标准析取范式。",
    "options": [],
    "answer": "**真值表：**\n| $p$ | $q$ | $\\neg p$ | $\\neg q$ | $p \\rightarrow \\neg p$ | $(p \\rightarrow \\neg p) \\rightarrow \\neg q$ |\n| :---: | :---: | :---: | :---: | :---: | :---: |\n| 1 | 1 | 0 | 0 | 0 | 1 |\n| 1 | 0 | 0 | 1 | 0 | 1 |\n| 0 | 1 | 1 | 0 | 1 | 0 |\n| 0 | 0 | 1 | 1 | 1 | 1 |\n**公式类型：** 非永真式的可满足式。\n**标准析取范式：** $(p \\wedge q) \\vee (p \\wedge \\neg q) \\vee (\\neg p \\wedge \\neg q)$ （或记作 $m_3 \\vee m_2 \\vee m_0$）",
    "analysis": "从真值表最后两行可以看出，公式在赋值为 (1,1)、(1,0)、(0,0) 时为真，在 (0,1) 时为假，因此是可满足式但非永真。将成真的三行写成极小项析取即可得到标准析取范式。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "calculation",
    "original_num": 3,
    "question": "利用等价演算方法求 $(p \\wedge q) \\vee (\\neg p \\vee r)$ 标准合取范式及成真赋值。",
    "options": [],
    "answer": "**标准合取范式：** $\\neg p \\vee q \\vee r$\n**成真赋值：** 除了 $p=1, q=0, r=0$ 之外的其余 7 种真值指派组合。",
    "analysis": "利用分配律进行等价演算：\n$$\\begin{aligned} (p \\wedge q) \\vee (\\neg p \\vee r) &\\Leftrightarrow ((p \\wedge q) \\vee \\neg p) \\vee r \\\\ &\\Leftrightarrow ((p \\vee \\neg p) \\wedge (q \\vee \\neg p)) \\vee r \\\\ &\\Leftrightarrow (1 \\wedge (\\neg p \\vee q)) \\vee r \\\\ &\\Leftrightarrow \\neg p \\vee q \\vee r \\end{aligned}$$\n由于 $\\neg p \\vee q \\vee r$ 本身就是一个包含全部三个变量的极大项（即 $M_4$），它已经处于标准合取范式的形式。该公式仅在 $p=1, q=0, r=0$ 时为假，其余 7 种赋值下均成真。",
    "topic": "propositional_logic",
    "sub_topic": "normal_forms"
  },
  {
    "category": "calculation",
    "original_num": 4,
    "question": "将下列命题符号化，要求符号化的公式为前束范式。\n(1) 有的汽车比有的火车跑得快。\n(2) 有的火车比所有的汽车跑得快。",
    "options": [],
    "answer": "设 $F(x)$：$x$ 是汽车，$H(y)$：$y$ 是火车，$P(x, y)$：$x$ 比 $y$ 跑得快。\n(1) $\\exists x \\exists y (F(x) \\wedge H(y) \\wedge P(x, y))$\n(2) $\\exists y \\forall x (H(y) \\wedge (F(x) \\rightarrow P(y, x)))$",
    "analysis": "(1) 原始符号化为 $\\exists x (F(x) \\wedge \\exists y (H(y) \\wedge P(x, y)))$，将量词均移至最前端即得前束范式。\n(2) 原始符号化为 $\\exists y (H(y) \\wedge \\forall x (F(x) \\rightarrow P(y, x)))$，同样将量词前置。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "proof",
    "original_num": 1,
    "question": "$p \\rightarrow q, \\neg(q \\wedge r), r \\Rightarrow \\neg p$",
    "options": [],
    "answer": "证明过程如下：\n① $r$ （前提引入）\n② $\\neg(q \\wedge r)$ （前提引入）\n③ $\\neg q \\vee \\neg r$ （由②置换）\n④ $\\neg q$ （由①③析取三段论/拒取式）\n⑤ $p \\rightarrow q$ （前提引入）\n⑥ $\\neg p$ （由④⑤拒取式式 MT）",
    "analysis": "无",
    "topic": "propositional_logic",
    "sub_topic": "prop_deduction"
  },
  {
    "category": "proof",
    "original_num": 2,
    "question": "$p \\rightarrow (q \\rightarrow r), p, q \\Rightarrow r \\vee s$",
    "options": [],
    "answer": "证明过程如下：\n① $p$ （前提引入）\n② $p \\rightarrow (q \\rightarrow r)$ （前提引入）\n③ $q \\rightarrow r$ （由①②假言推理 MP）\n④ $q$ （前提引入）\n⑤ $r$ （由③④假言推理 MP）\n⑥ $r \\vee s$ （由⑤析取附加律）",
    "analysis": "无",
    "topic": "propositional_logic",
    "sub_topic": "prop_deduction"
  },
  {
    "category": "proof",
    "original_num": 3,
    "question": "设 $P(x)$, $Q(x)$ 和 $R(x, y)$ 都是谓词，证明下列各等价式。\n(1) $\\neg \\exists x (P(x) \\wedge Q(x)) \\Leftrightarrow \\forall x (P(x) \\rightarrow \\neg Q(x))$\n(2) $\\neg \\forall x (P(x) \\rightarrow Q(x)) \\Leftrightarrow \\exists x (P(x) \\wedge \\neg Q(x))$\n(3) $\\neg \\forall x \\forall y (P(x) \\wedge Q(x) \\rightarrow R(x, y)) \\Leftrightarrow \\exists x \\exists y (P(x) \\wedge Q(x) \\wedge \\neg R(x, y))$\n(4) $\\neg \\exists x \\exists y (P(x) \\wedge Q(y) \\wedge R(x, y)) \\Leftrightarrow \\forall x \\forall y (P(x) \\wedge Q(y) \\rightarrow \\neg R(x, y))$",
    "options": [],
    "answer": "证明如下：\n(1) 左边 $\\Leftrightarrow \\forall x \\neg(P(x) \\wedge Q(x)) \\Leftrightarrow \\forall x (\\neg P(x) \\vee \\neg Q(x)) \\Leftrightarrow \\forall x (P(x) \\rightarrow \\neg Q(x)) \\Leftrightarrow$ 右边。\n(2) 左边 $\\Leftrightarrow \\exists x \\neg(P(x) \\rightarrow Q(x)) \\Leftrightarrow \\exists x \\neg(\\neg P(x) \\vee Q(x)) \\Leftrightarrow \\exists x (P(x) \\wedge \\neg Q(x)) \\Leftrightarrow$ 右边。\n(3) 左边 $\\Leftrightarrow \\exists x \\exists y \\neg(P(x) \\wedge Q(x) \\rightarrow R(x, y)) \\Leftrightarrow \\exists x \\exists y \\neg(\\neg(P(x) \\wedge Q(x)) \\vee R(x, y)) \\Leftrightarrow \\exists x \\exists y (P(x) \\wedge Q(x) \\wedge \\neg R(x, y)) \\Leftrightarrow$ 右边。\n(4) 左边 $\\Leftrightarrow \\forall x \\forall y \\neg(P(x) \\wedge Q(y) \\wedge R(x, y)) \\Leftrightarrow \\forall x \\forall y (\\neg(P(x) \\wedge Q(y)) \\vee \\neg R(x, y)) \\Leftrightarrow \\forall x \\forall y (P(x) \\wedge Q(y) \\rightarrow \\neg R(x, y)) \\Leftrightarrow$ 右边。",
    "analysis": "各小题主要运用了量词否定转换律、德·摩根定律以及蕴涵等价式（$A \\rightarrow B \\Leftrightarrow \\neg A \\vee B$）。",
    "topic": "predicate_logic",
    "sub_topic": "pred_deduction"
  },
  {
    "category": "application",
    "original_num": 1,
    "question": "某公司组织其下属甲、乙、丙三个工厂联合研制一个新产品，关于新产品的鉴定办法，在签定的合同中作了如下规定：\n（1）如果乙厂不参加新产品鉴定，则甲厂也不参加新产品鉴定；\n（2）如果乙厂参加新产品鉴定，则甲厂和丙厂也参加这种鉴定；\n请问：当甲厂参加新产品鉴定时，丙厂是否一定参加这种鉴定？",
    "options": [],
    "answer": "**丙厂一定参加。**\n推理过程如下：\n设 $A$：甲厂参加；$B$：乙厂参加；$C$：丙厂参加。\n由条件（1）得公式：$\\neg B \\rightarrow \\neg A$，其逆否命题等价于：$A \\rightarrow B$。\n由条件（2）得公式：$B \\rightarrow (A \\wedge C)$。\n现在已知前提为 $A$（甲厂参加）。\n① 既然 $A$ 成立，结合 $A \\rightarrow B$，通过假言推理可推导出 $B$ 成立（乙厂参加）。\n② 既然 $B$ 成立，结合 $B \\rightarrow (A \\wedge C)$，通过假言推理可推导出 $A \\wedge C$ 成立。\n③ 由 $A \\wedge C$ 成立，根据化简律可得 $C$ 成立，即丙厂一定参加。",
    "analysis": "无",
    "topic": "propositional_logic",
    "sub_topic": "prop_deduction"
  },
  {
    "category": "application",
    "original_num": 2,
    "question": "警方审讯三名嫌疑人 A、B、C，根据现场线索得到三条口供：\n（1）如果 A 作案，那么 B 一定是同案犯；\n（2）B 没有参与作案；\n（3）作案者一定在 A、C 两人之中。\n已知对应的简单命题的符号为：$p$: A 作案；$q$: B 作案；$r$: C 作案，请你运用所学知识，帮助该名警察推断到底是哪位嫌疑人作案？",
    "options": [],
    "answer": "**作案的嫌疑人是 C。**\n推理过程如下：\n将三条口供符号化为命题公式前提集：\n① $p \\rightarrow q$\n② $\\neg q$\n③ $p \\vee r$\n从已知前提进行演绎推理：\n1. 结合前提① $p \\rightarrow q$ 和前提② $\\neg q$，根据拒取式（Modus Tollens）规则，可推导出 $\\neg p$（即 A 没有作案）。\n2. 结合前提③ $p \\vee r$ 和刚刚推导出的 $\\neg p$，根据析取三段论（Disjunctive Syllogism）规则，可推导出 $r$ 成立（即 C 作案）。",
    "analysis": "无",
    "topic": "propositional_logic",
    "sub_topic": "prop_deduction"
  }
];
