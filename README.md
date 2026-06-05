SolarisSwahili — Dynamic Swahili Time System for Libya

تطبيق ويب أحادي الصفحة (SPA) يعرض ويحسب التوقيت السواحلي الديناميكي اعتماداً على الموقع الجغرافي الفعلي وحركة الشمس الحقيقية (الشروق والغروب)، مع واجهة حديثة وخفيفة تعمل مباشرة من المتصفح دون أي متطلبات بناء أو تثبيت.

يدعم التطبيق حالياً عدداً من المدن الليبية، مع إمكانية التوسع وإضافة مدن جديدة بسهولة.

Live Demo

[SolarisSwahili Live Website](https://azzubairx.github.io/SolarisSwahili/)


---

Features

حساب التوقيت السواحلي الديناميكي اعتماداً على:

وقت الشروق الحقيقي.

وقت الغروب الحقيقي.

تقسيم النهار والليل إلى ساعات نسبية متغيرة.


واجهة حديثة ومتجاوبة بالكامل.

نظام مظاهر تلقائي (Light / Dark Theme).

تحديث لحظي للوقت والبيانات الفلكية.

دعم مدن ليبية متعددة.

إمكانية إضافة مدن جديدة ديناميكياً.

بنية خفيفة بدون أي Build Process أو Dependencies.



---

Project Structure

SolarisSwahili/
│
├── index.html        # Main application structure
├── css/
│   └── style.css     # Themes, transitions, and custom styling
│
└── js/
    └── app.js        # Core logic and astronomical calculations


---

How It Works

يعتمد التطبيق على بيانات فلكية حقيقية لتحديد:

وقت الشروق.

وقت الغروب.

حالة الشمس الحالية.


بعد ذلك يتم:

1. حساب طول النهار وطول الليل.


2. تقسيم كل فترة إلى 12 ساعة نسبية.


3. إنشاء نظام توقيت سواحلي ديناميكي يتغير يومياً وفقاً لحركة الشمس.




---

Automatic Theme System

يحتوي التطبيق على محرك مظاهر تلقائي يعتمد على موقع الشمس الفعلي:

أثناء النهار يتم تفعيل المظهر النهاري.

بعد الغروب وحتى الشروق يتم تفعيل المظهر الليلي تلقائياً عبر إضافة:


.theme-night

إلى عنصر <body>.


---

Setup

لا يتطلب المشروع أي أدوات بناء أو تثبيت حزم.

Run Locally

1. قم باستنساخ المستودع:



git clone https://github.com/AzzubairX/SolarisSwahili.git

2. افتح ملف:



index.html

في أي متصفح حديث.


---

Technologies Used

HTML5

CSS3

JavaScript (Vanilla JS)

Tailwind CSS (CDN)

Astronomical Time APIs



---

Supported Cities

حالياً يدعم التطبيق:

طبرق

بنغازي

طرابلس


مع إمكانية التوسع مستقبلاً لدعم مدن إضافية.


---

Design Philosophy

تم تصميم المشروع ليكون:

خفيفاً وسريعاً.

سهل الفهم والتعديل.

مستقلاً بالكامل دون أطر عمل معقدة.

معتمداً على بيانات زمنية وفلكية حقيقية.



---

License

Copyright © 2026 Azzubair

All rights reserved.