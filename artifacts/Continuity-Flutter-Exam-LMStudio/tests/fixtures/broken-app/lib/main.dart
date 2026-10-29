import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:product_app/screens/home.dart';
import 'screens/missing_screen.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    setState(() {});
    return MaterialApp(
      home: Column(children: [
        Image.asset('assets/images/banner.png'),
        TextButton(onPressed: () => Navigator.pushNamed(context, '/cart'), child: const Text('Giỏ')),
      ]),
    );
  }
}
