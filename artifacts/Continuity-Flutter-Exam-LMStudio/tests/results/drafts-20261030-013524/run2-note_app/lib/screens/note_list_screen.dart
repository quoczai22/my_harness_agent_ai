import 'package:flutter/material.dart';
import 'package:note_app/models/note.dart';
import 'package:note_app/screens/login_screen.dart';

class NoteListScreen extends StatefulWidget {
  const NoteListScreen({super.key});

  @override
  State<NoteListScreen> createState() => _NoteListScreenState();
}

class _NoteListScreenState extends State<NoteListScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _priorityController = TextEditingController();
  final List<Note> _notes = [];

  @override
  void initState() {
    super.initState();
    // Giả lập dữ liệu từ file liên quan trong đề bài
    setState(() {
      _notes.addAll([
        Note(title: "Học Flutter", done: false, priority: 2),
        Note(title: "Luyện code", done: true, priority: 1),
      ]);
    });
  }

  void _addNewNote() {
    if (_formKey.currentState!.validate()) {
      final newTitle = _titleController.text.trim();
      final newPriority = int.tryParse(_priorityController.text);

      if (newTitle.isEmpty || newPriority == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Vui lòng nhập đầy đủ thông tin")),
        );
        return;
      }

      setState(() {
        _notes.insert(0, Note(title: newTitle, done: false, priority: newPriority!));
        _titleController.clear();
        _priorityController.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Danh sách Ghi chú"),
      ),
      body: ListView.builder(
        itemCount: _notes.length,
        itemBuilder: (context, index) {
          final note = _notes[index];
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(8.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(note.title),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Icon(Icons.done, color: note.done ? Colors.green : Colors.grey),
                      const SizedBox(width: 4),
                      Text("${note.priority}"),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addNewNote,
        child: const Icon(Icons.add),
      ),
    );
  }
}