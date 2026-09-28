// Datos de demostración. Ejecuta: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const inDays = (d: number) => new Date(Date.now() + d * 86400_000);

async function main() {
  await db.ledgerEntry.deleteMany();
  await db.creditTransaction.deleteMany();
  await db.notification.deleteMany();
  await db.review.deleteMany();
  await db.message.deleteMany();
  await db.request.updateMany({ data: { acceptedOfferId: null } });
  await db.offer.deleteMany();
  await db.request.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const monthAhead = new Date(Date.now() + 30 * 86400_000);
  const mk = (name: string, email: string, city: string, skills: string[], bio: string, plan = "FREE") => {
    const credits = plan === "ELITE" ? 80 : plan === "PRO" ? 30 : 5;
    return db.user.create({
      data: {
        name,
        email,
        city,
        skills: skills.join(","),
        bio,
        passwordHash,
        plan,
        credits,
        creditsGrantedAt: new Date(),
        planRenewsAt: plan === "FREE" ? null : monthAhead,
        creditTransactions: {
          create: { amount: credits, reason: plan === "FREE" ? "MONTHLY" : "PLAN", description: plan === "FREE" ? "Créditos gratis del mes" : `Suscripción plan ${plan === "PRO" ? "Pro" : "Élite"}` },
        },
      },
    });
  };

  const ana = await mk("Ana Torres", "ana@demo.ec", "Quito", [], "Estudiante de ingeniería comercial en la UCE.");
  const carlos = await mk(
    "Carlos Mendoza",
    "carlos@demo.ec",
    "Quito",
    ["academico", "tecnologia"],
    "Ingeniero en sistemas y tutor de matemáticas y programación desde hace 6 años.",
    "PRO",
  );
  const maria = await mk(
    "María José Vera",
    "maria@demo.ec",
    "Guayaquil",
    ["contabilidad", "legal"],
    "Contadora CPA. Declaraciones del SRI, auditorías y asesoría tributaria para pymes.",
    "ELITE",
  );
  const jose = await mk(
    "José Quiñónez",
    "jose@demo.ec",
    "Guayaquil",
    ["hogar", "mandados", "compras"],
    "Técnico en electrodomésticos y electricidad domiciliaria. También hago encargos.",
  );
  const lucia = await mk(
    "Lucía Paredes",
    "lucia@demo.ec",
    "Cuenca",
    ["diseno", "marketing", "redaccion"],
    "Diseñadora gráfica y community manager freelance.",
  );

  const req = (data: {
    authorId: string;
    title: string;
    description: string;
    category: string;
    kind?: string;
    modality?: string;
    city?: string;
    urgent?: boolean;
    budgetMin?: number;
    budgetMax?: number;
    deadline?: Date;
    createdAt: Date;
  }) => db.request.create({ data });

  await req({
    authorId: ana.id,
    title: "Tutoría de cálculo integral antes del examen del viernes",
    description:
      "Tengo examen de cálculo integral el viernes y me cuestan las integrales por partes y por sustitución trigonométrica.\n\nBusco a alguien que me explique con ejercicios en 2 sesiones de 2 horas. Puede ser por Zoom o presencial en el norte de Quito.",
    category: "academico",
    kind: "ACOMPANAMIENTO",
    city: "Quito",
    urgent: true,
    budgetMin: 15,
    budgetMax: 30,
    deadline: inDays(3),
    createdAt: hoursAgo(1),
  });

  const sri = await req({
    authorId: ana.id,
    title: "Revisión de mis declaraciones de IVA del último semestre",
    description:
      "Tengo un pequeño emprendimiento de repostería y creo que cometí errores en mis declaraciones mensuales de IVA. Necesito que un contador las revise y me diga si debo hacer sustitutivas.",
    category: "contabilidad",
    kind: "RESOLVER",
    modality: "REMOTO",
    budgetMin: 40,
    budgetMax: 80,
    deadline: inDays(10),
    createdAt: hoursAgo(5),
  });

  await req({
    authorId: carlos.id,
    title: "Busco quien me venda un repuesto de lavadora LG (bomba de desagüe)",
    description: "Modelo WT16DSB. Necesito la bomba de desagüe original o compatible, con entrega en Guayaquil. Pago contra entrega.",
    category: "compras",
    kind: "COMPRA",
    modality: "PRESENCIAL",
    city: "Guayaquil",
    urgent: true,
    budgetMax: 45,
    createdAt: hoursAgo(2),
  });

  await req({
    authorId: maria.id,
    title: "Logo y manual de marca para mi estudio contable",
    description: "Necesito un logo profesional, paleta de colores y plantillas para redes sociales para mi estudio contable. Estilo sobrio y moderno.",
    category: "diseno",
    kind: "RESOLVER",
    modality: "REMOTO",
    budgetMin: 80,
    budgetMax: 150,
    deadline: inDays(14),
    createdAt: hoursAgo(20),
  });

  await req({
    authorId: lucia.id,
    title: "Técnico para instalar tomacorrientes y revisar breaker",
    description: "Se salta el breaker cuando uso el microondas y la plancha a la vez. Además necesito instalar 3 tomacorrientes nuevos en la cocina.",
    category: "hogar",
    kind: "RESOLVER",
    modality: "PRESENCIAL",
    city: "Cuenca",
    budgetMin: 30,
    budgetMax: 60,
    createdAt: hoursAgo(8),
  });

  await req({
    authorId: jose.id,
    title: "Me ayuden a crear una página web sencilla para mi negocio",
    description: "Quiero una página de una sola sección con mis servicios, fotos de trabajos, botón de WhatsApp y ubicación en Google Maps.",
    category: "tecnologia",
    kind: "RESOLVER",
    modality: "REMOTO",
    budgetMin: 100,
    budgetMax: 200,
    createdAt: hoursAgo(30),
  });

  await req({
    authorId: carlos.id,
    title: "Asesoría para revisar contrato de arrendamiento antes de firmar",
    description: "Voy a arrendar un local comercial por 2 años. Quiero que un abogado revise las cláusulas de garantía, incrementos y terminación anticipada.",
    category: "legal",
    kind: "ACOMPANAMIENTO",
    modality: "CUALQUIERA",
    city: "Quito",
    budgetMin: 25,
    budgetMax: 50,
    deadline: inDays(5),
    createdAt: hoursAgo(12),
  });

  // Ofertas sobre la solicitud del SRI
  const offerMaria = await db.offer.create({
    data: {
      requestId: sri.id,
      providerId: maria.id,
      price: 55,
      deliveryDays: 3,
      message:
        "Hola Ana, soy contadora CPA y reviso declaraciones de IVA todos los días. Te entrego un informe con los errores encontrados y, si hace falta, preparo las sustitutivas.",
    },
  });
  await db.message.create({
    data: { offerId: offerMaria.id, senderId: ana.id, body: "¡Hola María! ¿Necesitas mis claves del SRI o con los formularios basta?", createdAt: hoursAgo(3) },
  });
  await db.message.create({
    data: {
      offerId: offerMaria.id,
      senderId: maria.id,
      body: "Con los formularios en PDF y tus facturas basta. Nunca compartas tus claves por aquí 🙂",
      createdAt: hoursAgo(2.5),
    },
  });

  // Un trabajo ya completado con reseña, para mostrar reputación
  const done = await req({
    authorId: ana.id,
    title: "Clases de Excel intermedio: tablas dinámicas y BUSCARV",
    description: "Necesitaba aprender tablas dinámicas para mi pasantía.",
    category: "tecnologia",
    kind: "ACOMPANAMIENTO",
    modality: "REMOTO",
    budgetMax: 20,
    createdAt: hoursAgo(24 * 12),
  });
  const doneOffer = await db.offer.create({
    data: { requestId: done.id, providerId: carlos.id, price: 20, deliveryDays: 2, message: "Te doy 2 clases prácticas con tus propios datos.", status: "ACCEPTED", feeRate: 0.07, creditsSpent: 2 },
  });
  await db.request.update({ where: { id: done.id }, data: { status: "COMPLETED", escrow: "RELEASED", acceptedOfferId: doneOffer.id } });
  // Rastro contable coherente del trabajo completado: pago recibido → retenido → liberado ($20, comisión Pro 7 %).
  const pay = await db.payment.create({
    data: { code: "PID-DEMO01", amountCents: 2000, status: "CONFIRMED", requestId: done.id, offerId: doneOffer.id, payerId: ana.id, confirmedAt: new Date() },
  });
  const releaseMemo = `Liberación confirmada · ${done.title}`;
  await db.ledgerEntry.createMany({
    data: [
      { txId: "seed-pay", account: "WORLD", amountCents: -2000, memo: "Pago PID-DEMO01 recibido", refType: "PAYMENT", refId: pay.id },
      { txId: "seed-pay", account: `ESCROW:${done.id}`, amountCents: 2000, memo: "Pago PID-DEMO01 recibido", refType: "PAYMENT", refId: pay.id },
      { txId: "seed-rel", account: `ESCROW:${done.id}`, amountCents: -2000, memo: releaseMemo, refType: "RELEASE", refId: done.id },
      { txId: "seed-rel", account: `AVAILABLE:${carlos.id}`, amountCents: 1860, memo: releaseMemo, refType: "RELEASE", refId: done.id },
      { txId: "seed-rel", account: "REVENUE", amountCents: 140, memo: releaseMemo, refType: "RELEASE", refId: done.id },
    ],
  });

  // Equipo de Pídelo: confirma pagos, resuelve disputas y transfiere retiros.
  await db.user.create({ data: { name: "Equipo Pídelo", email: "admin@demo.ec", passwordHash, role: "ADMIN" } });
  await db.review.create({
    data: { requestId: done.id, authorId: ana.id, targetId: carlos.id, rating: 5, comment: "Explica súper claro y tuvo mucha paciencia. ¡Recomendado!" },
  });
  await db.review.create({
    data: { requestId: done.id, authorId: carlos.id, targetId: ana.id, rating: 5, comment: "Muy puntual y con ganas de aprender." },
  });

  await db.notification.create({
    data: { userId: ana.id, title: "💬 Nueva oferta de María José Vera", body: "$55,00 · Revisión de mis declaraciones de IVA", link: `/solicitudes/${sri.id}` },
  });

  console.log("✓ Datos demo creados. Usuarios: ana@demo.ec, carlos@demo.ec, maria@demo.ec, jose@demo.ec, lucia@demo.ec + admin@demo.ec (clave: demo1234)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
