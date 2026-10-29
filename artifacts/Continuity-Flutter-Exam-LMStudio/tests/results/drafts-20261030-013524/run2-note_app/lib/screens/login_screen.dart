import 'package:flutter/material.dart';
import 'package:cupertino_icons.dart' as cupertino_icons;
import 'package:note_app/models/note.dart';
import 'package:note_app/screens/login_screen.dart'; // Import nội bộ để sử dụng các class đã định nghĩa trong đề bài

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _handleLogin() async {
    if (_formKey.currentState!.validate()) {
      // Giả lập việc gọi API để kiểm tra login (do đề bài yêu cầu chuyển sang NoteListScreen)
      await Future.delayed(const Duration(seconds: 1)); 

      if (_emailController.text.trim().isEmpty || 
          !_emailController.text.contains('@') || 
          _passwordController.text.length < 6) {
        // Validator tự động hoạt động, không cần gọi validate() thủ công ở đây vì Form đã xử lý
      } else {
        Navigator.pushReplacementNamed(context, '/note_list');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Đăng nhập'),
              const SizedBox(height: 16),
              Form(
                key: _formKey,
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _emailController,
                        decoration: const InputDecoration(labelText: 'Email'),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Vui lòng nhập email';
                          }
                          if (!value.contains('@')) {
                            return 'Email không được để trống và phải có ký tự @';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _passwordController,
                        decoration: InputDecoration(labelText: 'Mật khẩu'),
                        obscureText: true,
                        validator: (value) {
                          if (value == null || value.length < 6) {
                            return 'Mật khẩu tối thiểu là 6 ký tự';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: _handleLogin,
                child: const Text('Đăng nhập'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}