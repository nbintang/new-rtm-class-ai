import { faker } from '@faker-js/faker';
import {
  AIJobStatus,
  AIJobType,
  AssignmentStatus,
  AssignmentType,
  ClassroomMemberRole,
  MaterialStatus,
  OtpPurpose,
  Prisma,
  PrismaClient,
  SubmissionStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const COUNTS = {
  admins: 5,
  teachers: 15,
  students: 45,
  blogPosts: 25,
  classrooms: 15,
  otpCodes: 20,
  refreshTokens: 20,
  threadPerClassroom: 2,
  commentsPerThread: 3,
  materialsPerClassroom: 2,
  aiJobsPerMaterial: 2,
  assignmentsPerClassroom: 3,
  maxSubmissionsPerAssignment: 20,
  blogCommentsPerPost: 4,
};

const PASSWORD_PLAIN = 'Password123!';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function pickMany<T>(items: T[], min: number, max: number): T[] {
  if (items.length === 0) return [];
  const amount = faker.number.int({
    min: Math.max(1, min),
    max: Math.min(max, items.length),
  });
  return faker.helpers.arrayElements(items, amount);
}

function createUserInputs(
  role: UserRole,
  count: number,
  passwordHash: string,
): Prisma.UserCreateManyInput[] {
  return Array.from({ length: count }, (_, idx) => {
    const index = idx + 1;
    const roleKey = role.toLowerCase();
    return {
      fullName: faker.person.fullName(),
      email: `${roleKey}.${index}@rtmclass.test`,
      passwordHash,
      role,
      isSuspended: role !== UserRole.ADMIN && faker.datatype.boolean({ probability: 0.05 }),
    };
  });
}

async function clearDatabase() {
  await prisma.assignmentSubmission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.blogComment.deleteMany();
  await prisma.aiOutput.deleteMany();
  await prisma.aiJob.deleteMany();
  await prisma.material.deleteMany();
  await prisma.forumCommentUpvote.deleteMany();
  await prisma.forumThreadUpvote.deleteMany();
  await prisma.forumComment.deleteMany();
  await prisma.forumThread.deleteMany();
  await prisma.classroomMember.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  faker.seed(20260303);

  await clearDatabase();

  const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 10);

  await prisma.user.createMany({
    data: [
      ...createUserInputs(UserRole.ADMIN, COUNTS.admins, passwordHash),
      ...createUserInputs(UserRole.TEACHER, COUNTS.teachers, passwordHash),
      ...createUserInputs(UserRole.STUDENT, COUNTS.students, passwordHash),
    ],
  });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, fullName: true, email: true },
  });

  const admins = users.filter((user) => user.role === UserRole.ADMIN);
  const teachers = users.filter((user) => user.role === UserRole.TEACHER);
  const students = users.filter((user) => user.role === UserRole.STUDENT);

  await prisma.profile.createMany({
    data: users.map((user) => ({
      userId: user.id,
      address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
      phoneNumber: faker.helpers.fromRegExp('\\+62[0-9]{10,12}'),
      pictureUrl: faker.image.avatar(),
    })),
  });

  const blogInputs: Prisma.BlogPostCreateManyInput[] = Array.from(
    { length: COUNTS.blogPosts },
    (_, idx) => {
      const title = titleCase(faker.lorem.words({ min: 4, max: 8 }));
      const isPublished = faker.datatype.boolean({ probability: 0.8 });
      const publishedAt = isPublished
        ? faker.date.between({ from: new Date('2025-01-01'), to: new Date() })
        : null;
      return {
        title,
        slug: `${faker.helpers.slugify(title).toLowerCase()}-${idx + 1}`,
        excerpt: faker.lorem.sentence(),
        content: faker.lorem.paragraphs({ min: 2, max: 5 }, '\n\n'),
        isPublished,
        publishedAt,
        authorId: faker.helpers.arrayElement([...admins, ...teachers]).id,
      };
    },
  );
  await prisma.blogPost.createMany({ data: blogInputs });

  const classroomInputs: Prisma.ClassroomCreateManyInput[] = Array.from(
    { length: COUNTS.classrooms },
    (_, idx) => ({
      name: titleCase(`${faker.word.adjective()} ${faker.word.noun()} ${idx + 1}`),
      classCode: `CLS-${faker.string.alphanumeric({ length: 6, casing: 'upper' })}-${idx + 1}`,
      institutionName: faker.company.name(),
      classLevel: faker.helpers.arrayElement(['7', '8', '9', '10', '11', '12']),
      academicYear: faker.helpers.arrayElement(['2024/2025', '2025/2026', '2026/2027']),
      description: faker.lorem.sentences(2),
      teacherId: faker.helpers.arrayElement(teachers).id,
    }),
  );
  await prisma.classroom.createMany({ data: classroomInputs });

  const classrooms = await prisma.classroom.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, teacherId: true },
  });

  const memberKey = new Set<string>();
  const classroomMembers: Prisma.ClassroomMemberCreateManyInput[] = [];
  for (const classroom of classrooms) {
    const pushMember = (userId: string, role: ClassroomMemberRole) => {
      const key = `${classroom.id}:${userId}`;
      if (memberKey.has(key)) return;
      memberKey.add(key);
      classroomMembers.push({
        classroomId: classroom.id,
        userId,
        role,
      });
    };

    pushMember(classroom.teacherId, ClassroomMemberRole.TEACHER);
    for (const student of pickMany(students, 12, 25)) {
      pushMember(student.id, ClassroomMemberRole.STUDENT);
    }
  }
  await prisma.classroomMember.createMany({ data: classroomMembers });

  const membersByClassroom = new Map<string, string[]>();
  const studentsByClassroom = new Map<string, string[]>();
  for (const member of classroomMembers) {
    const existing = membersByClassroom.get(member.classroomId) ?? [];
    existing.push(member.userId);
    membersByClassroom.set(member.classroomId, existing);

    if (member.role === ClassroomMemberRole.STUDENT) {
      const existingStudents = studentsByClassroom.get(member.classroomId) ?? [];
      existingStudents.push(member.userId);
      studentsByClassroom.set(member.classroomId, existingStudents);
    }
  }

  const materials: {
    id: string;
    classroomId: string;
    uploadedById: string;
  }[] = [];

  for (const classroom of classrooms) {
    for (let i = 0; i < COUNTS.materialsPerClassroom; i += 1) {
      const material = await prisma.material.create({
        data: {
          classroomId: classroom.id,
          uploadedById: classroom.teacherId,
          title: titleCase(`Materi ${faker.word.noun()} ${i + 1}`),
          description: faker.lorem.sentence(),
          fileUrl: faker.internet.url(),
          fileMimeType: faker.helpers.arrayElement([
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
          ]),
          status: MaterialStatus.UPLOADED,
        },
        select: { id: true, classroomId: true, uploadedById: true },
      });

      materials.push(material);
    }
  }

  const availableJobTypes = [AIJobType.MCQ, AIJobType.ESSAY, AIJobType.SUMMARY];
  const materialJobStatusMap = new Map<string, AIJobStatus[]>();
  const aiJobIds: string[] = [];
  let aiOutputsCount = 0;

  for (const material of materials) {
    const classUsers = membersByClassroom.get(material.classroomId) ?? [material.uploadedById];
    const requestedById = faker.helpers.arrayElement(classUsers);
    const selectedTypes = pickMany(availableJobTypes, 1, COUNTS.aiJobsPerMaterial);

    for (const type of selectedTypes) {
      const status = faker.helpers.weightedArrayElement<AIJobStatus>([
        { value: AIJobStatus.succeeded, weight: 6 },
        { value: AIJobStatus.failed_processing, weight: 1 },
        { value: AIJobStatus.failed_delivery, weight: 1 },
        { value: AIJobStatus.processing, weight: 1 },
        { value: AIJobStatus.accepted, weight: 1 },
      ]);

      const startedAt = faker.date.recent({ days: 7 });
      const completedAt =
        status === AIJobStatus.succeeded ||
        status === AIJobStatus.failed_processing ||
        status === AIJobStatus.failed_delivery
          ? faker.date.between({ from: startedAt, to: new Date() })
          : null;

      const job = await prisma.aiJob.create({
        data: {
          materialId: material.id,
          requestedById,
          type,
          status,
          attempts: status === AIJobStatus.accepted ? 0 : faker.number.int({ min: 1, max: 3 }),
          parameters: {
            mcqCount: 10,
            essayCount: 5,
            summaryMaxWords: 200,
            mcpEnabled: true,
          },
          externalJobId:
            status === AIJobStatus.succeeded ||
            status === AIJobStatus.failed_processing ||
            status === AIJobStatus.failed_delivery
              ? `job-${faker.string.alphanumeric({ length: 24, casing: 'lower' })}`
              : null,
          lastError:
            status === AIJobStatus.failed_processing
              ? 'Model failed to generate output'
              : status === AIJobStatus.failed_delivery
                ? 'Callback delivery failed'
                : null,
          startedAt: status === AIJobStatus.accepted ? null : startedAt,
          completedAt,
        },
        select: { id: true, status: true },
      });

      aiJobIds.push(job.id);
      const currentStatuses = materialJobStatusMap.get(material.id) ?? [];
      currentStatuses.push(job.status);
      materialJobStatusMap.set(material.id, currentStatuses);

      if (status === AIJobStatus.succeeded) {
        await prisma.aiOutput.create({
          data: {
            materialId: material.id,
            jobId: job.id,
            type,
            content: {
              type,
              generatedAt: new Date().toISOString(),
              items:
                type === AIJobType.SUMMARY
                  ? faker.lorem.paragraphs(2, '\n\n')
                  : Array.from({ length: 3 }, (_, idx) => ({
                      no: idx + 1,
                      question: faker.lorem.sentence(),
                      answer: faker.lorem.sentence(),
                    })),
            },
            editedContent: faker.datatype.boolean({ probability: 0.3 })
              ? {
                  editorNote: 'Adjusted by teacher before publishing',
                }
              : Prisma.DbNull,
            isPublished: faker.datatype.boolean({ probability: 0.4 }),
            publishedAt: faker.datatype.boolean({ probability: 0.4 })
              ? faker.date.recent({ days: 5 })
              : null,
          },
        });
        aiOutputsCount += 1;
      }
    }
  }

  for (const material of materials) {
    const statuses = materialJobStatusMap.get(material.id) ?? [];
    const materialStatus = statuses.some(
      (status) => status === AIJobStatus.accepted || status === AIJobStatus.processing,
    )
      ? MaterialStatus.PROCESSING
      : statuses.some((status) => status === AIJobStatus.succeeded)
        ? MaterialStatus.READY
        : MaterialStatus.UPLOADED;

    await prisma.material.update({
      where: { id: material.id },
      data: { status: materialStatus },
    });
  }

  const threadIds: string[] = [];
  for (const classroom of classrooms) {
    const classroomUsers = membersByClassroom.get(classroom.id) ?? [classroom.teacherId];
    for (let i = 0; i < COUNTS.threadPerClassroom; i++) {
      const thread = await prisma.forumThread.create({
        data: {
          classroomId: classroom.id,
          authorId: faker.helpers.arrayElement(classroomUsers),
          title: titleCase(faker.lorem.sentence({ min: 4, max: 9 })),
          content: faker.lorem.paragraphs({ min: 1, max: 3 }, '\n\n'),
        },
        select: { id: true },
      });
      threadIds.push(thread.id);
    }
  }

  const comments: { id: string; threadId: string }[] = [];
  for (const threadId of threadIds) {
    for (let i = 0; i < COUNTS.commentsPerThread; i++) {
      const existingInThread = comments.filter((comment) => comment.threadId === threadId);
      const parentComment =
        existingInThread.length > 0 && faker.datatype.boolean({ probability: 0.35 })
          ? faker.helpers.arrayElement(existingInThread)
          : null;
      const comment = await prisma.forumComment.create({
        data: {
          threadId,
          authorId: faker.helpers.arrayElement(users).id,
          parentId: parentComment?.id ?? null,
          content: faker.lorem.sentences({ min: 1, max: 3 }),
        },
        select: { id: true, threadId: true },
      });
      comments.push(comment);
    }
  }

  const threadVoteKeys = new Set<string>();
  const threadVotes: Prisma.ForumThreadUpvoteCreateManyInput[] = [];
  for (const threadId of threadIds) {
    const voters = pickMany(users, 3, 10);
    for (const voter of voters) {
      const key = `${threadId}:${voter.id}`;
      if (threadVoteKeys.has(key)) continue;
      threadVoteKeys.add(key);
      threadVotes.push({ threadId, userId: voter.id });
    }
  }
  await prisma.forumThreadUpvote.createMany({ data: threadVotes });

  const commentVoteKeys = new Set<string>();
  const commentVotes: Prisma.ForumCommentUpvoteCreateManyInput[] = [];
  for (const comment of comments) {
    const voters = pickMany(users, 2, 8);
    for (const voter of voters) {
      const key = `${comment.id}:${voter.id}`;
      if (commentVoteKeys.has(key)) continue;
      commentVoteKeys.add(key);
      commentVotes.push({ commentId: comment.id, userId: voter.id });
    }
  }
  await prisma.forumCommentUpvote.createMany({ data: commentVotes });

  const blogPosts = await prisma.blogPost.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const blogComments: { id: string; postId: string }[] = [];
  for (const post of blogPosts) {
    for (let i = 0; i < COUNTS.blogCommentsPerPost; i += 1) {
      const existingInPost = blogComments.filter((comment) => comment.postId === post.id);
      const parentComment =
        existingInPost.length > 0 && faker.datatype.boolean({ probability: 0.35 })
          ? faker.helpers.arrayElement(existingInPost)
          : null;

      const created = await prisma.blogComment.create({
        data: {
          postId: post.id,
          authorId: faker.helpers.arrayElement(users).id,
          parentId: parentComment?.id ?? null,
          content: faker.lorem.sentences({ min: 1, max: 3 }),
        },
        select: { id: true, postId: true },
      });

      blogComments.push(created);
    }
  }

  const assignments: { id: string; classroomId: string; maxScore: number }[] = [];
  for (const classroom of classrooms) {
    const classMaterials = materials.filter((material) => material.classroomId === classroom.id);
    for (let i = 0; i < COUNTS.assignmentsPerClassroom; i += 1) {
      const assignmentType = faker.helpers.arrayElement<AssignmentType>([
        AssignmentType.QUIZ_MCQ,
        AssignmentType.QUIZ_ESSAY,
        AssignmentType.TASK,
        AssignmentType.REMEDIAL,
      ]);

      const isPublished = faker.datatype.boolean({ probability: 0.75 });
      const maxScore = faker.helpers.arrayElement([100, 100, 50]);
      const assignment = await prisma.assignment.create({
        data: {
          classroomId: classroom.id,
          materialId:
            classMaterials.length > 0 && faker.datatype.boolean({ probability: 0.7 })
              ? faker.helpers.arrayElement(classMaterials).id
              : null,
          createdById: classroom.teacherId,
          title: titleCase(`${assignmentType.replace('_', ' ')} ${faker.word.noun()} ${i + 1}`),
          description: faker.lorem.sentences(2),
          type: assignmentType,
          status: isPublished ? AssignmentStatus.PUBLISHED : AssignmentStatus.DRAFT,
          content:
            assignmentType === AssignmentType.QUIZ_MCQ
              ? {
                  questions: Array.from({ length: 5 }, (_, qIdx) => ({
                    id: `q${qIdx + 1}`,
                    text: faker.lorem.sentence(),
                    options: ['A', 'B', 'C', 'D'],
                    correctAnswer: faker.helpers.arrayElement(['A', 'B', 'C', 'D']),
                  })),
                }
              : assignmentType === AssignmentType.QUIZ_ESSAY
                ? {
                    questions: Array.from({ length: 3 }, (_, qIdx) => ({
                      id: `q${qIdx + 1}`,
                      text: faker.lorem.sentence(),
                      rubric: 'Explain with clear reasoning',
                    })),
                  }
                : {
                    instructions: faker.lorem.paragraphs(2, '\n\n'),
                  },
          passingScore: 70,
          maxScore,
          dueAt: isPublished ? faker.date.soon({ days: 14 }) : null,
          publishedAt: isPublished ? faker.date.recent({ days: 7 }) : null,
        },
        select: { id: true, classroomId: true, maxScore: true },
      });

      assignments.push(assignment);
    }
  }

  let assignmentSubmissionsCount = 0;
  let gradedSubmissionsCount = 0;
  for (const assignment of assignments) {
    const classStudents = studentsByClassroom.get(assignment.classroomId) ?? [];
    const submitters = pickMany(
      classStudents,
      Math.min(3, classStudents.length),
      Math.min(COUNTS.maxSubmissionsPerAssignment, classStudents.length),
    );

    for (const studentId of submitters) {
      const graded = faker.datatype.boolean({ probability: 0.65 });
      const score = graded
        ? faker.number.int({ min: 30, max: assignment.maxScore })
        : null;
      const submittedAt = faker.date.recent({ days: 10 });
      const gradedAt =
        graded && faker.datatype.boolean({ probability: 0.95 })
          ? faker.date.between({ from: submittedAt, to: new Date() })
          : null;

      await prisma.assignmentSubmission.create({
        data: {
          assignmentId: assignment.id,
          studentId,
          answers: {
            responses: [
              { questionId: 'q1', answer: faker.helpers.arrayElement(['A', 'B', 'C', 'D']) },
              { questionId: 'q2', answer: faker.helpers.arrayElement(['A', 'B', 'C', 'D']) },
            ],
          },
          status: graded ? SubmissionStatus.GRADED : SubmissionStatus.SUBMITTED,
          score,
          feedback: graded ? faker.lorem.sentence() : null,
          gradedById: graded ? classrooms.find((classroom) => classroom.id === assignment.classroomId)?.teacherId ?? null : null,
          submittedAt,
          gradedAt,
        },
      });

      assignmentSubmissionsCount += 1;
      if (graded) gradedSubmissionsCount += 1;
    }
  }

  await prisma.otp.createMany({
    data: Array.from({ length: COUNTS.otpCodes }, () => {
      const user = faker.helpers.arrayElement(users);
      const code = faker.string.numeric(6);
      return {
        userId: user.id,
        purpose: OtpPurpose.PASSWORD_RESET,
        codeHash: sha256(code),
        expiresAt: faker.date.soon({ days: 7 }),
        consumedAt: faker.datatype.boolean({ probability: 0.25 })
          ? faker.date.recent({ days: 2 })
          : null,
      };
    }),
  });

  await prisma.refreshToken.createMany({
    data: Array.from({ length: COUNTS.refreshTokens }, () => {
      const user = faker.helpers.arrayElement(users);
      const tokenRaw = faker.string.alphanumeric(64);
      return {
        userId: user.id,
        tokenHash: sha256(tokenRaw),
        expiresAt: faker.date.soon({ days: 30 }),
        revokedAt: faker.datatype.boolean({ probability: 0.2 })
          ? faker.date.recent({ days: 5 })
          : null,
      };
    }),
  });

  console.log('Seed completed.');
  console.log(
    JSON.stringify(
      {
        users: users.length,
        profiles: users.length,
        blogPosts: blogInputs.length,
        classrooms: classrooms.length,
        classroomMembers: classroomMembers.length,
        materials: materials.length,
        aiJobs: aiJobIds.length,
        aiOutputs: aiOutputsCount,
        forumThreads: threadIds.length,
        forumComments: comments.length,
        forumThreadUpvotes: threadVotes.length,
        forumCommentUpvotes: commentVotes.length,
        blogComments: blogComments.length,
        assignments: assignments.length,
        assignmentSubmissions: assignmentSubmissionsCount,
        gradedSubmissions: gradedSubmissionsCount,
        otpCodes: COUNTS.otpCodes,
        refreshTokens: COUNTS.refreshTokens,
        defaultPassword: PASSWORD_PLAIN,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
