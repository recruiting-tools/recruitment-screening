# InnovaBeyond — Question Review Test

Тест эндпоинта `POST /generate-questions` в режиме review/refine.

## Вход: оригинальные вопросы (со скриншотов)

| # | Оригинальный вопрос |
|---|---------------------|
| 1 | Tell us about your professional background, hobbies, fun facts about yourself |
| 2 | Tell us about your future goals? |
| 3 | How do you see yourself contributing to InnovaBeyond? |
| 4 | What are your financial expectations? |

## Запрос

```json
{
  "job_title": "General position at InnovaBeyond",
  "questions": [
    { "draft": "Tell us about your professional background, hobbies, fun facts about yourself", "follow_ups": 2 },
    { "draft": "Tell us about your future goals?", "follow_ups": 2 },
    { "draft": "How do you see yourself contributing to InnovaBeyond?", "follow_ups": 1 },
    { "draft": "What are your financial expectations?", "follow_ups": 0 }
  ],
  "language": "en",
  "persistence_level": 1,
  "output_format": "interview-engine"
}
```

## Результат

### Q1: Professional Background

**Оригинал:** Tell us about your professional background, hobbies, fun facts about yourself

**Доработано:** To start, could you please tell us a bit about your professional journey and what led you to this point in your career?

**Что исправлено:**
- Compound question (3 topics in one) → split to focus on professional background only, as it's a better warm-up for a professional interview.
- Removed 'hobbies' and 'fun facts' to keep the question focused on career, aligning with the 'ONE concept per question' rule.
- Reworded to be more conversational and invite storytelling about their career path.

**Follow-ups:**
1. Could you share an example of a project or role that was particularly impactful or a significant turning point for you?
2. What was a key learning or a significant challenge you overcame during that specific experience?

---

### Q2: Career Goals

**Оригинал:** Tell us about your future goals?

**Доработано:** Looking ahead, what are some of your key career aspirations and professional goals for the next few years?

**Что исправлено:**
- Refined 'future goals' to 'career aspirations and professional goals' to explicitly focus on the professional context of the interview.
- Maintained the open-ended, storytelling nature of the question.

**Follow-ups:**
1. What specific steps are you taking, or do you plan to take, to achieve these goals?
2. Is there a particular skill or area of expertise you are most eager to develop further in pursuit of these aspirations?

---

### Q3: Contribution to InnovaBeyond

**Оригинал:** How do you see yourself contributing to InnovaBeyond?

**Доработано:** How do you see yourself contributing to InnovaBeyond? *(без изменений)*

**Что исправлено:**
- Question was already well-phrased and open-ended, so no changes were needed to the original question text.

**Follow-ups:**
1. Can you give me a concrete example from your past experience where you made a similar type of contribution, and what was the outcome?

---

### Q4: Financial Expectations

**Оригинал:** What are your financial expectations?

**Доработано:** What are your financial expectations for this role?

**Что исправлено:**
- Added 'for this role' for clarity and specificity, making it directly relevant to the position being discussed.
- This is a direct question and does not require further rephrasing for an interview context.

**Follow-ups:** нет (follow_ups: 0)

---

## Мой комментарий к результату

**Хорошо:**
- Q1 правильно разбит: compound вопрос (3 темы) → одна тема. Hobbies и fun facts убраны.
- Follow-ups идут с разных ракурсов и просят конкретику.
- Q4 оставлен без follow-ups — правильно для зарплатного вопроса.
- `improvements` чётко объясняют каждое изменение.

**Можно доработать:**
- Q3 оставлен без изменений, хотя вопрос абстрактный — кандидат не знает чем занимается InnovaBeyond. Идеально было бы: "Based on what you've learned about InnovaBeyond, what area do you think you could have the biggest impact in?" Но это требует job_description на входе.
- Убранные hobbies/fun facts можно было бы предложить как отдельный вопрос-кандидат (но API не просили генерировать дополнительные вопросы — только рефайнить имеющиеся).

## Полный JSON-ответ

```json
{
  "questions": [
    {
      "id": "q1",
      "topic": "Professional Background",
      "question": "To start, could you please tell us a bit about your professional journey and what led you to this point in your career?",
      "followUpIfVague": [
        "Could you share an example of a project or role that was particularly impactful or a significant turning point for you?",
        "What was a key learning or a significant challenge you overcame during that specific experience?"
      ],
      "original": "Tell us about your professional background, hobbies, fun facts about yourself",
      "improvements": [
        "Compound question (3 topics in one) → split to focus on professional background only, as it's a better warm-up for a professional interview.",
        "Removed 'hobbies' and 'fun facts' to keep the question focused on career, aligning with the 'ONE concept per question' rule.",
        "Reworded to be more conversational and invite storytelling about their career path."
      ]
    },
    {
      "id": "q2",
      "topic": "Career Goals",
      "question": "Looking ahead, what are some of your key career aspirations and professional goals for the next few years?",
      "followUpIfVague": [
        "What specific steps are you taking, or do you plan to take, to achieve these goals?",
        "Is there a particular skill or area of expertise you are most eager to develop further in pursuit of these aspirations?"
      ],
      "original": "Tell us about your future goals?",
      "improvements": [
        "Refined 'future goals' to 'career aspirations and professional goals' to explicitly focus on the professional context of the interview.",
        "Maintained the open-ended, storytelling nature of the question."
      ]
    },
    {
      "id": "q3",
      "topic": "Contribution to InnovaBeyond",
      "question": "How do you see yourself contributing to InnovaBeyond?",
      "followUpIfVague": [
        "Can you give me a concrete example from your past experience where you made a similar type of contribution, and what was the outcome?"
      ],
      "original": "How do you see yourself contributing to InnovaBeyond?",
      "improvements": [
        "Question was already well-phrased and open-ended, so no changes were needed to the original question text."
      ]
    },
    {
      "id": "q4",
      "topic": "Financial Expectations",
      "question": "What are your financial expectations for this role?",
      "followUpIfVague": null,
      "original": "What are your financial expectations?",
      "improvements": [
        "Added 'for this role' for clarity and specificity, making it directly relevant to the position being discussed.",
        "This is a direct question and does not require further rephrasing for an interview context."
      ]
    }
  ]
}
```
