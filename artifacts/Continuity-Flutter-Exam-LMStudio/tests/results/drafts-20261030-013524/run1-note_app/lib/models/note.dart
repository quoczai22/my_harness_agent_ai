// Sinh từ mẫu JSON trong đề (không dùng AI).

class Note {
  final String title;
  final bool done;
  final int priority;

  const Note({required this.title, required this.done, required this.priority});

  factory Note.fromJson(Map<String, dynamic> json) => Note(
        title: json['title'] as String,
        done: json['done'] as bool,
        priority: json['priority'] as int,
      );

  Map<String, dynamic> toJson() => {
        'title': title,
        'done': done,
        'priority': priority,
      };
}
