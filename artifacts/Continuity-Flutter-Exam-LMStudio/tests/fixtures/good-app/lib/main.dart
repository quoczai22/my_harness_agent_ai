import 'package:flutter/material.dart';
import 'package:product_app/screens/product_list_screen.dart';
import 'screens/add_product_screen.dart';
import 'screens/product_detail_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      initialRoute: '/',
      routes: {
        '/': (context) => const ProductListScreen(),
        '/detail': (context) => const ProductDetailScreen(),
        '/add': (context) => const AddProductScreen(),
      },
    );
  }
}
